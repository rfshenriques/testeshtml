import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { WebsiteProbeService } from './website-probe.service';
import { scoreLead, ScoreInput } from './scoring';
import { DiscoveryService } from '../discovery/discovery.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { PipelineService } from '../pipeline/pipeline.service';

/** Qualification (spec §6.2–6.3): probe the website, hard-exclude, classify, score, advance. */
@Injectable()
export class QualificationService {
  private readonly log = new Logger(QualificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly probe: WebsiteProbeService,
    private readonly discovery: DiscoveryService,
    private readonly leadEvents: LeadEventsService,
    private readonly pipeline: PipelineService,
  ) {}

  async qualify(leadId: string, opts: { probeDelayMs?: number; advance?: boolean } = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true, contacts: true } });
    if (lead.stage === 'suppressed') return { excluded: true, reason: 'suppressed' };

    const probe = await this.probe.probe(lead.websiteUrl, { secondAttemptDelayMs: opts.probeDelayMs });
    const includeHttpOnly = lead.campaign.includeHttpOnly || this.env.INCLUDE_HTTP_ONLY_SITES;
    const excludedByWebsite = probe.status === 'live' || (probe.status === 'http_only' && !includeHttpOnly);
    const breakdown = scoreLead({
      primaryType: lead.primaryType, websiteStatus: probe.status, rating: lead.rating, reviewCount: lead.reviewCount, priceLevel: lead.priceLevel,
      businessStatus: lead.businessStatus, contact: contactState(lead.contacts, lead.phone),
      competitivePressureShare: (await this.discovery.competitivePressure(leadId)).share,
    });
    const excluded = breakdown.hardExcluded || excludedByWebsite;
    const reason = breakdown.hardExcluded ? breakdown.hardExcludeReason! : excludedByWebsite ? `website ${probe.status}` : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: { websiteStatus: probe.status, websiteProbe: probe as unknown as Prisma.InputJsonValue, score: breakdown.score, scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue, websiteUrl: probe.finalUrl ?? lead.websiteUrl },
      });
      await this.leadEvents.emit(leadId, 'qualification.probed', { status: probe.status, reason: probe.reason, score: breakdown.score }, tx);
      if (excluded && lead.stage !== 'excluded') {
        await tx.lead.update({ where: { id: leadId }, data: { stage: 'excluded', previousStage: lead.stage } });
        await this.leadEvents.emit(leadId, 'qualification.excluded', { reason }, tx);
      }
    });
    if (excluded) return { excluded: true, reason, probe, breakdown };
    if (lead.stage === 'discovered' || lead.stage === 'excluded') {
      await this.prisma.lead.update({ where: { id: leadId }, data: { stage: 'qualified', previousStage: lead.stage } });
      await this.leadEvents.emit(leadId, 'stage.advanced', { from: lead.stage, to: 'qualified' });
      if (opts.advance ?? true) await this.pipeline.next(leadId, 'qualified');
    }
    return { excluded: false, reason: null, probe, breakdown };
  }

  /** Re-score without re-probing (e.g. after enrichment changes contactability). */
  async rescore(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contacts: true } });
    const breakdown = scoreLead({
      primaryType: lead.primaryType, websiteStatus: lead.websiteStatus, rating: lead.rating, reviewCount: lead.reviewCount, priceLevel: lead.priceLevel,
      businessStatus: lead.businessStatus, contact: contactState(lead.contacts, lead.phone),
      competitivePressureShare: (await this.discovery.competitivePressure(leadId)).share,
    });
    await this.prisma.lead.update({ where: { id: leadId }, data: { score: breakdown.score, scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue } });
    return breakdown;
  }
}

export function contactState(contacts: { emailType: string; verification: string }[], phone: string | null): ScoreInput['contact'] {
  const valid = contacts.filter((c) => c.verification === 'valid');
  if (valid.some((c) => c.emailType === 'named')) return 'named_valid';
  if (valid.length) return 'role_valid';
  if (contacts.length) return 'unverified';
  if (phone) return 'phone_only';
  return 'none';
}
