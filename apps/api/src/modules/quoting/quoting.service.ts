import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PricingConfig, PricingConfigSchema, TierName } from '@sitewright/shared-types';
import { customAlphabet } from 'nanoid';
import { LinkTokenService } from '../compliance/link-token.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { JurisdictionService } from '../compliance/jurisdiction.service';
import { AuditService } from '../compliance/audit.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { PreviewService } from '../preview/preview.service';
import { computeQuote, QuoteComputation } from './pricing';
import { StripeService } from './stripe.service';
import { renderProposal } from './proposal.page';

const newQuoteSlug = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export interface QuotingHooks { onQuoted?: (leadId: string) => Promise<void> }

/** Quoting (spec §10): pricing engine → Quote row → hosted proposal page → Stripe Checkout. */
@Injectable()
export class QuotingService implements OnModuleInit {
  private readonly log = new Logger(QuotingService.name);
  readonly hooks: QuotingHooks = {};
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly jurisdictions: JurisdictionService,
    private readonly audit: AuditService,
    private readonly leadEvents: LeadEventsService,
    private readonly preview: PreviewService,
    private readonly stripe: StripeService,
    private readonly links: LinkTokenService,
  ) {}

  onModuleInit() {
    // Pipeline: preview published → quote → (outreach hook)
    this.preview.hooks.onPublished = async (leadId) => {
      await this.createQuote(leadId).catch((e) => this.log.error({ leadId, err: (e as Error).message }, 'auto quote failed'));
      if (this.hooks.onQuoted) await this.hooks.onQuoted(leadId);
    };
  }

  async config(): Promise<PricingConfig> {
    const row = await this.prisma.pricingConfig.findUnique({ where: { id: 'default' } });
    if (!row) throw new Error('pricing config missing: run the seed');
    return PricingConfigSchema.parse(row.config);
  }

  async updateConfig(raw: unknown, actor: string) {
    const config = PricingConfigSchema.parse(raw);
    const before = await this.prisma.pricingConfig.findUnique({ where: { id: 'default' } });
    const row = await this.prisma.pricingConfig.upsert({ where: { id: 'default' }, create: { id: 'default', config: config as unknown as Prisma.InputJsonValue }, update: { config: config as unknown as Prisma.InputJsonValue } });
    await this.audit.log('pricing.updated', { before: before?.config ?? null, after: config }, { actor, subjectId: 'default' });
    return PricingConfigSchema.parse(row.config);
  }

  quoteUrl(slug: string) {
    return `${this.env.QUOTE_HOST.replace(/\/$/, '')}/${slug}`;
  }

  async compute(leadId: string, opts: { tier?: TierName; addOns?: string[] } = {}): Promise<QuoteComputation> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const [config, policy, quartile] = await Promise.all([this.config(), this.jurisdictions.get(lead.countryCode), this.bottomQuartile(lead.campaignId)]);
    return computeQuote(config, { countryCode: lead.countryCode, currency: policy?.defaultCurrency ?? config.currency, primaryType: lead.primaryType, reviewCount: lead.reviewCount, score: lead.score, bottomQuartileScore: quartile, addOns: opts.addOns, tier: opts.tier });
  }

  /** Bottom-quartile score of the campaign, or null while fewer than 8 leads are scored (the rule needs a distribution). */
  private async bottomQuartile(campaignId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ q: number | null; n: bigint | number }[]>`SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY score) AS q, count(*) AS n FROM "Lead" WHERE "campaignId" = ${campaignId} AND score IS NOT NULL AND stage NOT IN ('excluded')`;
    if (!rows[0] || Number(rows[0].n) < 8 || rows[0].q == null) return null;
    return Number(rows[0].q);
  }

  async createQuote(leadId: string, opts: { tier?: TierName; addOns?: string[]; actor?: string } = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { quote: true } });
    if (lead.stage === 'suppressed') throw new Error('lead is suppressed');
    const c = await this.compute(leadId, opts);
    const rec = c.tiers[c.recommendedTier];
    const validUntil = new Date(Date.now() + c.validDays * 86400_000);
    const data = {
      currency: c.currency, tier: c.recommendedTier, buildFee: new Prisma.Decimal(rec.buildFee), monthlyFee: new Prisma.Decimal(rec.monthly),
      lineItems: rec.lineItems as unknown as Prisma.InputJsonValue, allTiers: { tiers: c.tiers, reasoning: c.reasoning, multiplier: c.multiplier, addOns: c.addOns } as unknown as Prisma.InputJsonValue, validUntil,
    };
    const quote = lead.quote && !lead.quote.acceptedAt
      ? await this.prisma.quote.update({ where: { id: lead.quote.id }, data })
      : lead.quote
        ? lead.quote
        : await this.prisma.quote.create({ data: { ...data, leadId, slug: newQuoteSlug() } });
    await this.leadEvents.emit(leadId, 'quote.created', { tier: quote.tier, buildFee: Number(quote.buildFee), monthlyFee: Number(quote.monthlyFee), currency: quote.currency, actor: opts.actor ?? 'system' });
    if (['generated', 'profiled', 'enriched'].includes(lead.stage)) await this.leadEvents.advance(leadId, 'quoted');
    return { ...quote, buildFee: Number(quote.buildFee), monthlyFee: Number(quote.monthlyFee), url: this.quoteUrl(quote.slug) };
  }

  async getForLead(leadId: string) {
    const q = await this.prisma.quote.findUnique({ where: { leadId } });
    return q ? { ...q, buildFee: Number(q.buildFee), monthlyFee: Number(q.monthlyFee), url: this.quoteUrl(q.slug) } : null;
  }

  /** Signed per-lead booking page (source recorded as `proposal`). */
  bookingUrl(leadId: string): string {
    return `${this.env.APP_BASE_URL}/book/${this.links.sign({ p: 'book', leadId })}?src=proposal`;
  }

  /** Public proposal page (spec §10.2). */
  async proposalHtml(slug: string): Promise<{ status: number; html: string }> {
    const quote = await this.prisma.quote.findUnique({ where: { slug }, include: { lead: { include: { site: true } } } });
    if (!quote || quote.lead.stage === 'suppressed') return { status: 404, html: renderProposal.notFound() };
    if (quote.validUntil < new Date() && !quote.acceptedAt) return { status: 410, html: renderProposal.expired(this.env.AGENCY_NAME, this.bookingUrl(quote.leadId)) };
    const site = quote.lead.site;
    const previewUrl = site && !site.takenDownAt && site.expiresAt > new Date() ? site.previewUrl : null;
    const takedownUrl = `${this.env.APP_BASE_URL}/q/${slug}/decline`;
    return { status: 200, html: renderProposal.page({ quote, lead: quote.lead, previewUrl, acceptUrl: `${this.env.APP_BASE_URL}/q/${slug}/accept`, bookingUrl: this.bookingUrl(quote.leadId), declineUrl: takedownUrl, agency: { name: this.env.AGENCY_NAME, url: this.env.AGENCY_URL, legalName: this.env.LEGAL_ENTITY_NAME, address: this.env.LEGAL_ENTITY_ADDRESS } }) };
  }

  /** Accept → Stripe Checkout session (one-off build fee + subscription). */
  async accept(slug: string, tierRaw: string | undefined): Promise<{ url: string } | { error: string; status: number }> {
    const quote = await this.prisma.quote.findUnique({ where: { slug }, include: { lead: { include: { contacts: { where: { isPrimary: true } } } } } });
    if (!quote || quote.lead.stage === 'suppressed') return { error: 'not found', status: 404 };
    if (quote.validUntil < new Date()) return { error: 'quote expired', status: 410 };
    if (quote.acceptedAt) return { error: 'already accepted', status: 409 };
    const all = quote.allTiers as any;
    const tier = (tierRaw && all?.tiers?.[tierRaw] ? tierRaw : quote.tier) as TierName;
    const t = all.tiers[tier];
    const session = await this.stripe.createCheckout({
      quoteId: quote.id, leadId: quote.leadId, businessName: quote.lead.businessName, currency: quote.currency, buildFee: t.buildFee, monthly: t.monthly, tier,
      successUrl: `${this.env.APP_BASE_URL}/q/${slug}/thanks`, cancelUrl: this.quoteUrl(slug), customerEmail: quote.lead.contacts[0]?.email ?? null,
    });
    await this.prisma.quote.update({ where: { id: quote.id }, data: { stripeSessionId: session.id, tier, buildFee: new Prisma.Decimal(t.buildFee), monthlyFee: new Prisma.Decimal(t.monthly), lineItems: t.lineItems } });
    await this.leadEvents.emit(quote.leadId, 'quote.checkout_started', { tier, sessionId: session.id });
    await this.audit.log('quote.checkout_started', { tier, sessionId: session.id }, { leadId: quote.leadId, subjectId: quote.id });
    return { url: session.url };
  }

  /** "Not interested, remove my details" (spec §10.2): suppression + takedown. */
  async decline(slug: string): Promise<boolean> {
    const quote = await this.prisma.quote.findUnique({ where: { slug } });
    if (!quote) return false;
    await this.preview.takedown(quote.leadId, 'takedown_request', 'recipient');
    await this.leadEvents.emit(quote.leadId, 'quote.declined', {});
    return true;
  }
}
