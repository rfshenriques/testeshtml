import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { Classification, ClassificationSchema, PLACE_TYPE_VERTICAL, ContentBrief } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../../shared/llm/llm.service';
import { DetailsService } from '../discovery/details.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { JurisdictionService } from '../compliance/jurisdiction.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { CLASSIFY_SYSTEM, classifyUser } from './prompts';
import { buildContentBrief } from './content-brief';

export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Profiling (spec §7): fetch Place Details (qualified leads only), classify with the LLM at low
 * temperature, route low-confidence / insufficient-data results to the manual review queue, else
 * advance to `profiled`. Language defaults to the country's business language, campaign override wins.
 */
@Injectable()
export class ProfilingService {
  private readonly log = new Logger(ProfilingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly details: DetailsService,
    private readonly discovery: DiscoveryService,
    private readonly jurisdictions: JurisdictionService,
    private readonly leadEvents: LeadEventsService,
    private readonly pipeline: PipelineService,
  ) {}

  async classify(leadId: string, opts: { advance?: boolean } = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true } });
    if (lead.stage === 'suppressed' || lead.stage === 'excluded') return { routed: 'skipped' as const, classification: null };
    const details = await this.details.fetch(leadId).catch((e) => {
      this.log.warn({ leadId, err: (e as Error).message }, 'details unavailable; classifying from search data');
      return null;
    });
    const inputs = {
      name: lead.businessName,
      types: details?.types ?? (lead.primaryType ? [lead.primaryType] : []),
      address: details?.formattedAddress ?? null,
      summary: details?.editorialSummary ?? null,
      reviews: (details?.reviews ?? []).map((r) => r.text).filter(Boolean),
      countryCode: lead.countryCode,
    };
    const { value: classification, raw } = await this.llm.completeJson(
      { system: CLASSIFY_SYSTEM, user: classifyUser(inputs), temperature: 0, maxTokens: 600, purpose: 'classify', leadId, campaignId: lead.campaignId },
      ClassificationSchema,
    );
    const lowConfidence = classification.confidence < CONFIDENCE_THRESHOLD || classification.insufficientData;
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { classification: classification as unknown as Prisma.InputJsonValue, vertical: classification.vertical } });
      await this.leadEvents.emit(leadId, 'profiling.classified', { vertical: classification.vertical, confidence: classification.confidence, insufficientData: classification.insufficientData, lowConfidence }, tx);
      if (lowConfidence) {
        await tx.reviewItem.create({ data: { leadId, type: 'low_confidence_classification', payload: { classification, inputs, raw } as unknown as Prisma.InputJsonValue } });
        await tx.lead.update({ where: { id: leadId }, data: { stage: 'manual_review', previousStage: lead.stage } });
      }
    });
    if (lowConfidence) return { routed: 'manual_review' as const, classification };
    await this.leadEvents.advance(leadId, 'profiled', { vertical: classification.vertical });
    if (opts.advance ?? true) await this.pipeline.next(leadId, 'profiled');
    return { routed: 'profiled' as const, classification };
  }

  /** Applied when the operator approves (optionally edits) a low-confidence classification. */
  async applyApprovedClassification(leadId: string, edits: Partial<Classification> | undefined, actor: string, advance = true) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const current = (lead.classification ?? {}) as Partial<Classification>;
    const merged = ClassificationSchema.parse({ ...current, ...(edits ?? {}), confidence: 1, insufficientData: false });
    await this.prisma.lead.update({ where: { id: leadId }, data: { classification: merged as unknown as Prisma.InputJsonValue, vertical: merged.vertical, stage: 'profiled', previousStage: lead.stage } });
    await this.leadEvents.emit(leadId, 'profiling.approved', { actor, edited: !!edits });
    if (advance) await this.pipeline.next(leadId, 'profiled');
    return merged;
  }

  /** Language: campaign override, else the jurisdiction default, else classification guess, else en. */
  async languageFor(leadId: string): Promise<string> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true } });
    if (lead.campaign.languageCode) return lead.campaign.languageCode;
    const policy = await this.jurisdictions.get(lead.countryCode);
    return policy?.defaultLanguageCode ?? 'en';
  }

  /** Build the content brief for generation (spec §7). Falls back to a type-derived classification only for template preview. */
  async brief(leadId: string): Promise<ContentBrief> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const parsed = ClassificationSchema.safeParse(lead.classification);
    if (!parsed.success) throw new Error(`lead ${leadId} has no approved classification`);
    const details = await this.details.latestSnapshot(lead.placeId);
    const competitive = await this.discovery.competitivePressure(leadId);
    const language = await this.languageFor(leadId);
    return buildContentBrief(lead, details, parsed.data, competitive, language);
  }

  static fallbackVertical(primaryType: string | null) {
    return (primaryType && PLACE_TYPE_VERTICAL[primaryType]) || 'other';
  }
}
