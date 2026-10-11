import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { StripeService } from '../quoting/stripe.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { AuditService } from '../compliance/audit.service';
import { AlertService } from '../ops/alert.service';
import { SequenceService } from '../outreach/sequence.service';
import { BillingService } from '../billing/billing.service';

/** Provisioning checklist (spec §12.2): semi-automated, human-confirmed. */
export const PROVISIONING_CHECKLIST: { key: string; label: string }[] = [
  { key: 'onboarding_form', label: 'Onboarding form sent to client (real copy, photos, logo, hours, services, social links, domain preference)' },
  { key: 'domain', label: 'Domain registered or transferred (DECISION: registrar)' },
  { key: 'promote_site', label: 'Preview promoted to production project; placeholder markers and mockup banner removed' },
  { key: 'cms', label: 'CMS attached (Decap for starter, Payload for business/premium); client login + 2-page guide delivered' },
  { key: 'email', label: 'Business email set up (if purchased)' },
  { key: 'gbp_analytics', label: 'Google Business Profile linked, analytics (Plausible/GA4), Search Console verified, sitemap submitted' },
  { key: 'uptime', label: 'Uptime monitoring registered' },
  { key: 'handover', label: 'Handover call done and written summary sent' },
];

@Injectable()
export class ConversionService {
  private readonly log = new Logger(ConversionService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly stripe: StripeService,
    private readonly leadEvents: LeadEventsService,
    private readonly audit: AuditService,
    private readonly alerts: AlertService,
    private readonly sequence: SequenceService,
    private readonly billing: BillingService,
  ) {}

  /** Stripe webhook: checkout.session.completed → quote accepted → lead won → provisioning + subscription. */
  async handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ ok: boolean; handled?: string }> {
    const event = await this.stripe.parseWebhook(rawBody, signature);
    if (!event) return { ok: false };
    if (event.type === 'checkout.session.completed') {
      const session = event.data;
      const quoteId = session.metadata?.quoteId as string | undefined;
      const quote = quoteId ? await this.prisma.quote.findUnique({ where: { id: quoteId } }) : await this.prisma.quote.findFirst({ where: { stripeSessionId: session.id } });
      if (!quote) { this.log.warn({ sessionId: session.id }, 'checkout completed for unknown quote'); return { ok: true, handled: 'unknown quote' }; }
      if (quote.acceptedAt) return { ok: true, handled: 'already accepted' };
      await this.accept(quote.id, { stripeSessionId: session.id, stripeCustomerId: session.customer ?? null, stripeSubscriptionId: session.subscription ?? null, tier: session.metadata?.tier ?? quote.tier });
      return { ok: true, handled: 'accepted' };
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.deleted') {
      await this.billing.handleStripeEvent(event.type, event.data);
      return { ok: true, handled: event.type };
    }
    return { ok: true, handled: 'ignored' };
  }

  async accept(quoteId: string, info: { stripeSessionId?: string | null; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; tier?: string; actor?: string }) {
    const quote = await this.prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lead: true } });
    const tier = info.tier ?? quote.tier;
    const all = quote.allTiers as any;
    const t = all?.tiers?.[tier];
    await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quoteId }, data: { acceptedAt: new Date(), tier, stripeSessionId: info.stripeSessionId ?? quote.stripeSessionId, stripeCustomerId: info.stripeCustomerId ?? null, stripeSubscriptionId: info.stripeSubscriptionId ?? null, ...(t ? { buildFee: new Prisma.Decimal(t.buildFee), monthlyFee: new Prisma.Decimal(t.monthly), lineItems: t.lineItems } : {}) } });
      await tx.lead.update({ where: { id: quote.leadId }, data: { stage: 'won', previousStage: quote.lead.stage, sequenceStoppedAt: new Date(), sequenceStopReason: 'won' } });
      await tx.outreachMessage.updateMany({ where: { leadId: quote.leadId, status: 'queued' }, data: { status: 'cancelled', error: 'won' } });
      await tx.provisioning.upsert({ where: { leadId: quote.leadId }, create: { leadId: quote.leadId, checklist: PROVISIONING_CHECKLIST.map((c) => ({ ...c, done: false, doneAt: null, by: null, note: null })) as unknown as Prisma.InputJsonValue, cmsKind: tier === 'starter' ? 'decap' : 'payload' }, update: {} });
    });
    await this.leadEvents.emit(quote.leadId, 'quote.accepted', { tier, stripeSessionId: info.stripeSessionId ?? null, actor: info.actor ?? 'stripe' });
    await this.audit.log('quote.accepted', { quoteId, tier, stripe: info }, { actor: info.actor ?? 'stripe', leadId: quote.leadId, subjectId: quoteId });
    await this.billing.startSubscription(quote.leadId, tier, Number(t?.monthly ?? quote.monthlyFee), quote.currency, info.stripeSubscriptionId ?? null);
    await this.alerts.raise('deal_won', 'info', `${quote.lead.businessName} accepted the ${tier} quote`, { leadId: quote.leadId });
    // Forward any mockup form submissions captured before conversion (spec §9.2).
    await this.prisma.formSubmission.updateMany({ where: { site: { leadId: quote.leadId }, forwarded: false }, data: { forwarded: true } });
    return { leadId: quote.leadId, tier };
  }

  async list() {
    const rows = await this.prisma.provisioning.findMany({ orderBy: { createdAt: 'desc' }, include: { lead: { select: leadSelect }, subscription: true } });
    return rows.map((r) => ({ ...r, lead: summarise(r.lead) }));
  }

  async get(leadId: string) {
    const p = await this.prisma.provisioning.findUnique({ where: { leadId }, include: { subscription: true, lead: { select: leadSelect } } });
    return p ? { ...p, lead: summarise(p.lead) } : null;
  }

  async setItem(leadId: string, key: string, done: boolean, note: string | undefined, actor: string) {
    const p = await this.prisma.provisioning.findUniqueOrThrow({ where: { leadId } });
    const checklist = (p.checklist as any[]).map((c) => (c.key === key ? { ...c, done, doneAt: done ? new Date().toISOString() : null, by: done ? actor : null, note: note ?? c.note } : c));
    const completedAt = checklist.every((c) => c.done) ? new Date() : null;
    const updated = await this.prisma.provisioning.update({ where: { leadId }, data: { checklist: checklist as unknown as Prisma.InputJsonValue, completedAt } });
    await this.audit.log('provisioning.item', { key, done, note }, { actor, leadId });
    if (completedAt) await this.leadEvents.emit(leadId, 'provisioning.completed', { actor });
    return updated;
  }

  async setOnboarding(leadId: string, form: Record<string, unknown>, actor: string) {
    const updated = await this.prisma.provisioning.update({ where: { leadId }, data: { onboardingForm: form as Prisma.InputJsonValue } });
    await this.audit.log('provisioning.onboarding', { keys: Object.keys(form) }, { actor, leadId });
    return updated;
  }
}
import { leadSummarySelect as leadSelect, toLeadSummary as summarise } from '../crm/lead-summary';
