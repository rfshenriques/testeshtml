import { Inject, Injectable, Logger } from '@nestjs/common';
import { Contact, EmailType, Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { QuotaService } from '../ops/quota.service';
import { CostLedgerService } from '../ops/cost-ledger.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { GateService } from '../compliance/gate.service';
import { QualificationService } from '../qualification/qualification.service';
import { SuppressionService } from '../compliance/suppression.service';
import { EMAIL_VERIFIER, ENRICHMENT_ADAPTERS, EmailVerifier, EnrichmentAdapter, EnrichmentLead, ContactCandidate, VerifyResult } from './enrichment.types';

export interface EnrichOutcome {
  leadId: string;
  adaptersTried: { name: string; candidates: number; valid: number; skipped?: string }[];
  contacts: number;
  primary: string | null;
  fallbackChannel: 'email' | 'phone_outreach' | 'postal_outreach';
  gate: string | null;
}

/**
 * Enrichment (spec §6.4–6.5): run adapters in cost order, verify every candidate, keep only
 * sourced contacts, pick a primary (named valid > role valid), then run the legal gate.
 * Hard rule: a lead only advances with ≥1 contact at verification === 'valid'.
 */
@Injectable()
export class EnrichmentService {
  private readonly log = new Logger(EnrichmentService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(ENRICHMENT_ADAPTERS) private readonly adapters: EnrichmentAdapter[],
    @Inject(EMAIL_VERIFIER) private readonly verifier: EmailVerifier,
    private readonly quotas: QuotaService,
    private readonly costs: CostLedgerService,
    private readonly leadEvents: LeadEventsService,
    private readonly pipeline: PipelineService,
    private readonly gate: GateService,
    private readonly qualification: QualificationService,
    private readonly suppression: SuppressionService,
  ) {}

  adapterStatus() {
    return this.adapters.map((a) => ({ name: a.name, available: a.available, unavailableReason: a.unavailableReason ?? null, costPerLookupUsd: a.costPerLookupUsd }));
  }

  async enrich(leadId: string, opts: { advance?: boolean } = {}): Promise<EnrichOutcome> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contacts: true } });
    if (lead.stage === 'suppressed' || lead.stage === 'excluded') return { leadId, adaptersTried: [], contacts: lead.contacts.length, primary: null, fallbackChannel: lead.fallbackChannel, gate: null };
    const el: EnrichmentLead = { id: lead.id, businessName: lead.businessName, countryCode: lead.countryCode, city: lead.city, phone: lead.phone, websiteStatus: lead.websiteStatus, websiteUrl: lead.websiteUrl, address: null, placeId: lead.placeId };
    const tried: EnrichOutcome['adaptersTried'] = [];
    let foundValid = lead.contacts.some((c) => c.verification === 'valid');

    for (const adapter of this.adapters) {
      if (foundValid) break;
      if (!adapter.available) { tried.push({ name: adapter.name, candidates: 0, valid: 0, skipped: adapter.unavailableReason ?? 'unavailable' }); continue; }
      if (!adapter.supports(el)) { tried.push({ name: adapter.name, candidates: 0, valid: 0, skipped: 'not supported for this lead' }); continue; }
      try {
        await this.quotas.consume('enrichment_lookups', this.env.ENRICHMENT_DAILY_LOOKUP_CAP, 1);
        const candidates = await adapter.find(el);
        let valid = 0;
        for (const c of candidates) {
          if (!c.source?.trim()) continue; // undisclosable → never stored
          const stored = await this.storeCandidate(leadId, c);
          const v = await this.verifyContact(stored.id, c.email);
          if (v.state === 'valid') { valid++; foundValid = true; }
        }
        tried.push({ name: adapter.name, candidates: candidates.length, valid });
        await this.leadEvents.emit(leadId, 'enrichment.adapter', { adapter: adapter.name, candidates: candidates.length, valid });
      } catch (e) {
        tried.push({ name: adapter.name, candidates: 0, valid: 0, skipped: `error: ${(e as Error).message}` });
        this.log.warn({ leadId, adapter: adapter.name, err: (e as Error).message }, 'adapter failed');
      }
    }

    const primary = await this.choosePrimary(leadId);
    const fallbackChannel = primary ? 'email' : lead.phone ? 'phone_outreach' : 'postal_outreach';
    await this.prisma.lead.update({ where: { id: leadId }, data: { fallbackChannel, lastTouchAt: new Date() } });
    await this.qualification.rescore(leadId);

    let gateResult: string | null = null;
    if (primary) {
      if (lead.stage === 'qualified') {
        await this.leadEvents.advance(leadId, 'enriched', { primary: primary.email });
      }
      const g = await this.gate.evaluate(leadId, { context: 'post-enrichment' });
      gateResult = g.result;
      if (g.result === 'clear' && (opts.advance ?? true)) await this.pipeline.next(leadId, 'enriched');
    } else {
      await this.leadEvents.emit(leadId, 'enrichment.no_contact', { fallbackChannel, adaptersTried: tried });
    }
    const contacts = await this.prisma.contact.count({ where: { leadId } });
    return { leadId, adaptersTried: tried, contacts, primary: primary?.email ?? null, fallbackChannel, gate: gateResult };
  }

  private async storeCandidate(leadId: string, c: ContactCandidate): Promise<Contact> {
    const email = c.email.trim().toLowerCase();
    return this.prisma.contact.upsert({
      where: { leadId_email: { leadId, email } },
      create: { leadId, email, emailType: c.emailType as EmailType, source: c.source, sourceUrl: c.sourceUrl, sourceLicence: c.sourceLicence ?? null, confidence: c.confidence },
      update: { source: c.source, sourceUrl: c.sourceUrl, confidence: Math.max(c.confidence, 0) },
    });
  }

  /** Verify one contact (adapter candidates and manually added contacts alike). Suppressed emails are never verified. */
  async verifyContact(contactId: string, emailHint?: string): Promise<VerifyResult> {
    const contact = await this.prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
    const email = emailHint ?? contact.email;
    const sup = await this.suppression.isSuppressed({ email });
    if (sup.suppressed) {
      await this.prisma.contact.update({ where: { id: contactId }, data: { verification: 'invalid', verifiedAt: new Date(), verifier: 'suppression' } });
      return { state: 'invalid', provider: 'suppression', reason: 'suppressed' };
    }
    await this.quotas.consume('email_verify', this.env.EMAIL_VERIFY_DAILY_CAP, 1);
    const result = await this.verifier.verify(email);
    if (this.verifier.costPerCheckUsd > 0) await this.costs.record({ category: 'email_verify', units: 1, usd: this.verifier.costPerCheckUsd, provider: result.provider, leadId: contact.leadId });
    await this.prisma.contact.update({ where: { id: contactId }, data: { verification: result.state, verifiedAt: new Date(), verifier: result.provider } });
    await this.leadEvents.emit(contact.leadId, 'contact.verified', { email, state: result.state, provider: result.provider, reason: result.reason });
    return result;
  }

  /** named valid > role_generic valid > nothing. catchall/risky/unverified are never primary (spec §6.5 hard rule). */
  async choosePrimary(leadId: string): Promise<Contact | null> {
    const contacts = await this.prisma.contact.findMany({ where: { leadId, verification: 'valid' }, orderBy: { confidence: 'desc' } });
    const primary = contacts.find((c) => c.emailType === 'named') ?? contacts.find((c) => c.emailType === 'role_generic') ?? null;
    await this.prisma.contact.updateMany({ where: { leadId }, data: { isPrimary: false } });
    if (primary) await this.prisma.contact.update({ where: { id: primary.id }, data: { isPrimary: true } });
    return primary;
  }

  async addManualContact(leadId: string, input: { email: string; source: string; sourceUrl?: string | null; emailType?: 'named' | 'role_generic' }, actor: string) {
    if (!input.source?.trim()) throw new Error('a named source is required (Art. 14)');
    const contact = await this.storeCandidate(leadId, { email: input.email, source: `manual:${input.source}`, sourceUrl: input.sourceUrl ?? null, emailType: input.emailType ?? 'named', confidence: 0.9 });
    await this.leadEvents.emit(leadId, 'contact.added', { email: contact.email, source: contact.source, actor });
    await this.pipeline.enqueue('enrichmentVerify', 'verify', leadId, { contactId: contact.id }, { force: true });
    return contact;
  }

  async setPrimary(leadId: string, contactId: string) {
    const c = await this.prisma.contact.findFirstOrThrow({ where: { id: contactId, leadId } });
    if (c.verification !== 'valid') throw new Error('only a valid (verified) contact can be primary');
    await this.prisma.contact.updateMany({ where: { leadId }, data: { isPrimary: false } });
    await this.prisma.contact.update({ where: { id: contactId }, data: { isPrimary: true } });
    await this.qualification.rescore(leadId);
    return this.gate.evaluate(leadId, { context: 'primary-changed' });
  }

  /** Hit-rate report (spec M3): per adapter and overall coverage of qualified leads. */
  async report(campaignId?: string) {
    const where = campaignId ? { campaignId } : {};
    const events = await this.prisma.leadEvent.findMany({ where: { type: 'enrichment.adapter', lead: where }, select: { payload: true } });
    const perAdapter = new Map<string, { tried: number; candidates: number; valid: number }>();
    for (const e of events) {
      const p = e.payload as { adapter: string; candidates: number; valid: number };
      const row = perAdapter.get(p.adapter) ?? { tried: 0, candidates: 0, valid: 0 };
      row.tried++; row.candidates += p.candidates; row.valid += p.valid;
      perAdapter.set(p.adapter, row);
    }
    const [qualifiedPlus, withValid, byChannel] = await Promise.all([
      this.prisma.lead.count({ where: { ...where, stage: { notIn: ['discovered', 'excluded', 'suppressed'] } } }),
      this.prisma.lead.count({ where: { ...where, stage: { notIn: ['discovered', 'excluded', 'suppressed'] }, contacts: { some: { verification: 'valid' } } } }),
      this.prisma.lead.groupBy({ by: ['fallbackChannel'], where: { ...where, stage: { notIn: ['discovered', 'excluded', 'suppressed'] } }, _count: { _all: true } }),
    ]);
    return {
      adapters: [...perAdapter.entries()].map(([name, r]) => ({ name, ...r, hitRate: r.tried ? r.valid / r.tried : 0 })),
      adapterStatus: this.adapterStatus(),
      coverage: { leads: qualifiedPlus, withValidContact: withValid, rate: qualifiedPlus ? withValid / qualifiedPlus : 0 },
      channels: byChannel.map((b) => ({ channel: b.fallbackChannel, count: b._count._all })),
    };
  }
}
