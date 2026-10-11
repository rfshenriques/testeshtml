import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { QuotingService } from '../quoting/quoting.service';
import { AuditService } from '../compliance/audit.service';
import { AlertService } from '../ops/alert.service';

/** Explicit SLAs per recurring service (spec §12.3). */
export const SLA = {
  hostingMaintenance: { uptimeTarget: 0.999, backupsRetainedDays: 30, patchingCadence: 'monthly', sslRenewal: true, uptimeAlerting: true, performanceReport: 'quarterly' },
  contentManagement: { turnaroundBusinessDays: 2, rollover: false, definition: 'text/image/page changes, not redesigns' },
  localSeo: { gbpOptimisation: true, citationConsistency: true, rankingReport: 'monthly on an agreed keyword set' },
};

/** Recurring services: subscriptions, update allowances, overage visibility, invoices (spec §12.3). */
@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);
  constructor(private readonly prisma: PrismaService, private readonly quoting: QuotingService, private readonly audit: AuditService, private readonly alerts: AlertService) {}

  async startSubscription(leadId: string, tier: string, monthlyFee: number, currency: string, stripeSubscriptionId: string | null) {
    const prov = await this.prisma.provisioning.findUniqueOrThrow({ where: { leadId } });
    const config = await this.quoting.config();
    const t = (config.tiers as any)[tier] ?? config.tiers.business;
    const sla = { hostingMaintenance: SLA.hostingMaintenance, ...(t.updatesPerMonth ? { contentManagement: { ...SLA.contentManagement, updatesPerMonth: t.updatesPerMonth } } : {}), ...(tier === 'premium' ? { localSeo: SLA.localSeo } : {}) };
    return this.prisma.serviceSubscription.upsert({
      where: { provisioningId: prov.id },
      create: { provisioningId: prov.id, tier, monthlyFee: new Prisma.Decimal(monthlyFee), currency, updatesIncluded: t.updatesPerMonth, sla: sla as unknown as Prisma.InputJsonValue, stripeSubscriptionId },
      update: { tier, monthlyFee: new Prisma.Decimal(monthlyFee), currency, updatesIncluded: t.updatesPerMonth, sla: sla as unknown as Prisma.InputJsonValue, stripeSubscriptionId, status: 'active', cancelledAt: null },
    });
  }

  static month(d = new Date()) {
    return d.toISOString().slice(0, 7);
  }

  async usage(subscriptionId: string, month = BillingService.month()) {
    const sub = await this.prisma.serviceSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const used = await this.prisma.updateRequest.count({ where: { subscriptionId, month } });
    return { month, used, included: sub.updatesIncluded, overage: Math.max(0, used - sub.updatesIncluded) };
  }

  /** Track update requests against the tier allowance so overages are visible and billable (spec §12.3). */
  async addUpdateRequest(subscriptionId: string, description: string, actor: string) {
    const u = await this.usage(subscriptionId);
    const dueAt = addBusinessDays(new Date(), SLA.contentManagement.turnaroundBusinessDays);
    const req = await this.prisma.updateRequest.create({ data: { subscriptionId, month: u.month, description, dueAt, billable: u.used >= u.included } });
    await this.audit.log('billing.update_request', { subscriptionId, billable: req.billable, used: u.used + 1, included: u.included }, { actor, subjectId: req.id });
    if (req.billable) await this.alerts.raise('update_overage', 'info', `Update request over the monthly allowance (${u.used + 1}/${u.included}); billable`, { subscriptionId, requestId: req.id });
    return req;
  }

  async completeUpdateRequest(id: string) {
    return this.prisma.updateRequest.update({ where: { id }, data: { completedAt: new Date() } });
  }

  async list() {
    const subs = await this.prisma.serviceSubscription.findMany({ orderBy: { startedAt: 'desc' }, include: { provisioning: { include: { lead: { select: leadSelect } } } } });
    return Promise.all(subs.map(async (s) => ({ ...s, monthlyFee: Number(s.monthlyFee), lead: summarise(s.provisioning.lead), usage: await this.usage(s.id) })));
  }

  async get(id: string) {
    const s = await this.prisma.serviceSubscription.findUniqueOrThrow({ where: { id }, include: { updateRequests: { orderBy: { requestedAt: 'desc' } }, invoices: { orderBy: { createdAt: 'desc' } }, provisioning: { include: { lead: { select: leadSelect } } } } });
    return { ...s, monthlyFee: Number(s.monthlyFee), lead: summarise(s.provisioning.lead), usage: await this.usage(s.id), invoices: s.invoices.map((i) => ({ ...i, amount: Number(i.amount) })), slaOverdue: s.updateRequests.filter((r) => !r.completedAt && r.dueAt < new Date()).length };
  }

  /** Stripe Billing events mirror into our ledger. */
  async handleStripeEvent(type: string, data: any) {
    const subId = data.subscription ?? data.id;
    const sub = subId ? await this.prisma.serviceSubscription.findFirst({ where: { stripeSubscriptionId: subId } }) : null;
    if (!sub) return;
    if (type === 'invoice.paid') {
      await this.prisma.invoice.create({ data: { subscriptionId: sub.id, period: BillingService.month(new Date((data.period_start ?? Date.now() / 1000) * 1000)), amount: new Prisma.Decimal((data.amount_paid ?? 0) / 100), currency: (data.currency ?? sub.currency).toUpperCase(), status: 'paid', stripeInvoiceId: data.id } });
      if (sub.status !== 'active') await this.prisma.serviceSubscription.update({ where: { id: sub.id }, data: { status: 'active' } });
    } else if (type === 'invoice.payment_failed') {
      await this.prisma.serviceSubscription.update({ where: { id: sub.id }, data: { status: 'past_due' } });
      await this.alerts.raise('payment_failed', 'warning', `Subscription payment failed (${sub.id})`, { subscriptionId: sub.id });
    } else if (type === 'customer.subscription.deleted') {
      await this.prisma.serviceSubscription.update({ where: { id: sub.id }, data: { status: 'cancelled', cancelledAt: new Date() } });
    }
  }
}

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added++;
  }
  return d;
}
import { leadSummarySelect as leadSelect, toLeadSummary as summarise } from '../crm/lead-summary';
