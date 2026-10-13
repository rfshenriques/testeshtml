import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStage, LegalGate, Prisma, WebsiteStatus } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { leadSummarySelect, toLeadSummary } from './lead-summary';
import { LeadEventsService } from './lead-events.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { SuppressionService, SuppressionReason } from '../compliance/suppression.service';
import { AuditService } from '../compliance/audit.service';
import { DetailsService } from '../discovery/details.service';
import { QuotingService } from '../quoting/quoting.service';
import { SequenceService } from '../outreach/sequence.service';

export interface LeadFilter {
  campaignId?: string; stage?: LeadStage; legalGate?: LegalGate; countryCode?: string; vertical?: string; websiteStatus?: WebsiteStatus; minScore?: number; q?: string; fallbackChannel?: string;
  /** Prospect tier: a = email + photos, b = photos without email, c = no photos. */
  tier?: 'a' | 'b' | 'c'; hasEmail?: boolean; hasPhone?: boolean; minPhotos?: number;
  sort?: 'score' | 'createdAt' | 'lastTouchAt' | 'priority'; dir?: 'asc' | 'desc'; take?: number; cursor?: string;
}

export type LeadAction = 'requalify' | 'enrich' | 'verify' | 'profile' | 'generate' | 'publish' | 'quote' | 'engage' | 'enqueue_outreach' | 'stop_sequence' | 'suppress' | 'mark_lost' | 'mark_won' | 'set_priority';

/** Lead pipeline views and manual actions (spec §13.1 Leads screen). */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadEvents: LeadEventsService,
    private readonly pipeline: PipelineService,
    private readonly suppression: SuppressionService,
    private readonly audit: AuditService,
    private readonly details: DetailsService,
    private readonly quoting: QuotingService,
    private readonly sequence: SequenceService,
  ) {}

  async list(f: LeadFilter) {
    const where: Prisma.LeadWhereInput = {
      ...(f.campaignId ? { campaignId: f.campaignId } : {}), ...(f.stage ? { stage: f.stage } : {}), ...(f.legalGate ? { legalGate: f.legalGate } : {}),
      ...(f.countryCode ? { countryCode: f.countryCode.toUpperCase() } : {}), ...(f.vertical ? { vertical: f.vertical } : {}), ...(f.websiteStatus ? { websiteStatus: f.websiteStatus } : {}),
      ...(f.minScore != null ? { score: { gte: f.minScore } } : {}), ...(f.fallbackChannel ? { fallbackChannel: f.fallbackChannel as any } : {}),
      ...(f.q ? { OR: [{ businessName: { contains: f.q, mode: 'insensitive' } }, { city: { contains: f.q, mode: 'insensitive' } }, { contacts: { some: { email: { contains: f.q, mode: 'insensitive' } } } }] } : {}),
      ...(f.tier === 'a' ? { photoCount: { gt: 0 }, contacts: { some: { isPrimary: true } } } : f.tier === 'b' ? { photoCount: { gt: 0 }, contacts: { none: {} } } : f.tier === 'c' ? { photoCount: 0 } : {}),
      ...(f.hasEmail === true ? { contacts: { some: { isPrimary: true } } } : f.hasEmail === false ? { contacts: { none: {} } } : {}),
      ...(f.hasPhone === true ? { phone: { not: null } } : f.hasPhone === false ? { phone: null } : {}),
      ...(f.minPhotos != null ? { photoCount: { gte: f.minPhotos } } : {}),
    };
    const take = Math.min(200, Math.max(1, f.take ?? 50));
    const sort = f.sort ?? 'score';
    const dir = f.dir ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({ where, select: leadSummarySelect, orderBy: [{ [sort]: { sort: dir, nulls: 'last' } }, { id: 'asc' }], take: take + 1, ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}) }),
      this.prisma.lead.count({ where }),
    ]);
    const items = rows.slice(0, take).map((r) => toLeadSummary(r));
    return { items, total, nextCursor: rows.length > take ? rows[take - 1].id : null };
  }

  /**
   * Businesses without a website, per country, bucketed by what we have on them: email + photos (quote first,
   * easiest cash flow), photos but no email (cold call with a mockup), nothing (later, with references).
   */
  async prospects() {
    const rows = await this.prisma.$queryRaw<{ countryCode: string; total: number; tierA: number; tierB: number; tierC: number; withEmail: number; withPhone: number; withPhotos: number; generated: number; quoted: number }[]>`
      SELECT l."countryCode" AS "countryCode", count(*)::int AS total,
        count(*) FILTER (WHERE l."photoCount" > 0 AND c.n > 0)::int AS "tierA",
        count(*) FILTER (WHERE l."photoCount" > 0 AND COALESCE(c.n, 0) = 0)::int AS "tierB",
        count(*) FILTER (WHERE l."photoCount" = 0)::int AS "tierC",
        count(*) FILTER (WHERE c.n > 0)::int AS "withEmail",
        count(*) FILTER (WHERE l.phone IS NOT NULL)::int AS "withPhone",
        count(*) FILTER (WHERE l."photoCount" > 0)::int AS "withPhotos",
        count(*) FILTER (WHERE s."leadId" IS NOT NULL)::int AS generated,
        count(*) FILTER (WHERE q."leadId" IS NOT NULL)::int AS quoted
      FROM "Lead" l
      LEFT JOIN (SELECT "leadId", count(*)::int AS n FROM "Contact" WHERE "isPrimary" GROUP BY "leadId") c ON c."leadId" = l.id
      LEFT JOIN "GeneratedSite" s ON s."leadId" = l.id
      LEFT JOIN "Quote" q ON q."leadId" = l.id
      WHERE l.stage NOT IN ('excluded', 'suppressed', 'lost')
      GROUP BY l."countryCode" ORDER BY total DESC`;
    return { countries: rows };
  }

  /** Push a lead into generation → publish → quote from wherever it stopped, including leads without an email (phone bucket). */
  async engage(id: string, actor: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id }, select: { stage: true, classification: true, site: { select: { publishedAt: true, takenDownAt: true } }, quote: { select: { id: true } }, contacts: { where: { isPrimary: true }, take: 1 } } });
    if (lead.stage === 'suppressed' || lead.stage === 'excluded') throw new Error(`lead is ${lead.stage}`);
    if (lead.stage === 'discovered' || lead.stage === 'qualified') {
      await this.leadEvents.advance(id, 'enriched', { actor, note: lead.contacts.length ? 'engaged by operator' : 'engaged without email: phone outreach' });
    }
    if (!lead.classification) { await this.pipeline.enqueue('profilingClassify', 'classify', id, { reason: 'engage' }, { force: true }); return 'profile'; }
    if (!lead.site) { await this.pipeline.enqueue('generatorBuild', 'build', id, { reason: 'engage' }, { force: true }); return 'generate'; }
    if (!lead.site.publishedAt || lead.site.takenDownAt) { await this.pipeline.enqueue('previewPublish', 'publish', id, {}, { force: true }); return 'publish'; }
    if (!lead.quote) { await this.quoting.createQuote(id, { actor }); return 'quote'; }
    return 'already engaged';
  }

  async detail(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { contacts: { orderBy: { isPrimary: 'desc' } }, site: true, quote: true, messages: { orderBy: { createdAt: 'desc' } }, replies: { orderBy: { receivedAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' }, take: 200 }, reviewItems: { orderBy: { createdAt: 'desc' } }, tasks: { orderBy: { createdAt: 'desc' } }, meetings: { orderBy: { startAt: 'desc' } }, provisioning: true, campaign: { select: { name: true, status: true } } },
    });
    if (!lead) throw new NotFoundException();
    const snapshot = await this.prisma.placeSnapshot.findFirst({ where: { placeId: lead.placeId, expiresAt: { gt: new Date() } }, orderBy: [{ kind: 'asc' }, { fetchedAt: 'desc' }] });
    const { contacts, site, quote, messages, replies, events, reviewItems, tasks, meetings, provisioning, ...rest } = lead;
    const summary = toLeadSummary({ ...rest, contacts: contacts.filter((c) => c.isPrimary).map((c) => ({ email: c.email, verification: c.verification, source: c.source })), site: site ? { previewUrl: site.previewUrl, takenDownAt: site.takenDownAt, expiresAt: site.expiresAt } : null, quote: quote ? { slug: quote.slug } : null } as any);
    return {
      lead: { ...summary, scoreBreakdown: lead.scoreBreakdown, classification: lead.classification, websiteProbe: lead.websiteProbe, gateOverride: lead.gateOverride, notes: lead.notes, lat: lead.lat, lng: lead.lng, priceLevel: lead.priceLevel, businessStatus: lead.businessStatus, sequenceStartedAt: lead.sequenceStartedAt, sequenceStoppedAt: lead.sequenceStoppedAt, sequenceStopReason: lead.sequenceStopReason, campaign: lead.campaign },
      snapshot: snapshot ? { kind: snapshot.kind, raw: snapshot.raw, fetchedAt: snapshot.fetchedAt, expiresAt: snapshot.expiresAt } : null,
      contacts, site, quote: quote ? { ...quote, buildFee: Number(quote.buildFee), monthlyFee: Number(quote.monthlyFee), url: this.quoting.quoteUrl(quote.slug) } : null, messages, replies, events, reviewItems, tasks, meetings, provisioning,
    };
  }

  async patch(id: string, body: { notes?: string; priority?: number; fallbackChannel?: 'email' | 'phone_outreach' | 'postal_outreach' }, actor: string) {
    const lead = await this.prisma.lead.update({ where: { id }, data: { notes: body.notes, priority: body.priority, fallbackChannel: body.fallbackChannel } });
    await this.audit.log('lead.edited', body, { actor, leadId: id });
    return toLeadSummary(await this.prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: leadSummarySelect }));
  }

  async action(id: string, action: LeadAction, payload: Record<string, any> = {}, actor = 'operator'): Promise<{ id: string; ok: boolean; error?: string }> {
    try {
      const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id } });
      if (lead.stage === 'suppressed' && action !== 'suppress') throw new Error('lead is suppressed (terminal)');
      switch (action) {
        case 'requalify': await this.pipeline.enqueue('qualificationProbe', 'qualify', id, {}, { force: true }); break;
        case 'enrich': await this.pipeline.enqueue('enrichmentEmail', 'enrich', id, {}, { force: true }); break;
        case 'verify': {
          const contacts = await this.prisma.contact.findMany({ where: { leadId: id } });
          for (const c of contacts) await this.pipeline.enqueue('enrichmentVerify', 'verify', id, { contactId: c.id }, { force: true });
          break;
        }
        case 'profile': await this.pipeline.enqueue('profilingClassify', 'classify', id, {}, { force: true }); break;
        case 'generate': await this.pipeline.enqueue('generatorBuild', 'build', id, { regenerateCopy: !!payload.regenerateCopy, reason: 'operator' }, { force: true }); break;
        case 'publish': await this.pipeline.enqueue('previewPublish', 'publish', id, {}, { force: true }); break;
        case 'quote': await this.quoting.createQuote(id, { tier: payload.tier, addOns: payload.addOns, actor }); break;
        case 'engage': await this.engage(id, actor); break;
        case 'enqueue_outreach': await this.sequence.start(id, actor); break;
        case 'stop_sequence': await this.sequence.stop(id, payload.reason ?? 'operator', actor); break;
        case 'suppress': await this.suppression.suppressLead(id, (payload.reason as SuppressionReason) ?? 'operator', { actor, note: payload.note }); break;
        case 'mark_lost': await this.sequence.stop(id, 'marked lost', actor); await this.leadEvents.setStage(id, 'lost', { actor, note: payload.note }); break;
        case 'mark_won': await this.sequence.stop(id, 'won', actor); await this.leadEvents.setStage(id, 'won', { actor, note: payload.note }); break;
        case 'set_priority': await this.prisma.lead.update({ where: { id }, data: { priority: Number(payload.priority ?? 0) } }); break;
        default: throw new Error(`unknown action ${action}`);
      }
      await this.audit.log(`lead.action.${action}`, payload, { actor, leadId: id });
      return { id, ok: true };
    } catch (e) {
      return { id, ok: false, error: (e as Error).message };
    }
  }

  async bulk(ids: string[], action: LeadAction, payload: Record<string, any> = {}, actor = 'operator') {
    const results = [];
    for (const id of ids.slice(0, 500)) results.push(await this.action(id, action, payload, actor));
    return { ok: true, enqueued: results.filter((r) => r.ok).length, results };
  }

  async addTask(leadId: string, title: string, dueAt?: string) {
    return this.prisma.crmTask.create({ data: { leadId, title, dueAt: dueAt ? new Date(dueAt) : null } });
  }
  async completeTask(id: string) {
    return this.prisma.crmTask.update({ where: { id }, data: { doneAt: new Date() } });
  }
  async tasks(openOnly: boolean) {
    const rows = await this.prisma.crmTask.findMany({ where: openOnly ? { doneAt: null } : {}, orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], include: { lead: { select: leadSummarySelect } }, take: 500 });
    return rows.map((r) => ({ ...r, lead: toLeadSummary(r.lead) }));
  }
}
