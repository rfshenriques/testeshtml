import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { COLOUR_SCHEMES, ContentBrief, SiteBuildInput, SiteCopy, SiteCopySchema, TEMPLATE_FAMILIES, TemplateFamily, TYPOGRAPHY_PAIRINGS, VERTICAL_TEMPLATE, Vertical } from '@sitewright/shared-types';
import { customAlphabet } from 'nanoid';
import * as path from 'node:path';
import { z } from 'zod';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { LlmService } from '../../shared/llm/llm.service';
import { ProfilingService } from '../profiling/profiling.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { LinkTokenService } from '../compliance/link-token.service';
import { GateService } from '../compliance/gate.service';
import { AstroSiteBuilder } from './site-builder.service';
import { checkCopy, getPath, neutralFor, setPath, Violation } from './hallucination-guard';
import { copySystem, copyUser, regenerateFieldUser } from './copy.prompts';
import { ImageSource, seededIndex, selectImages, UnsplashSource } from './images';

/** 22-char, URL-safe, unguessable; never derived from the business name (spec §9.5). */
export const newSlug = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 22);

export const TEMPLATE_SECTIONS: Record<TemplateFamily, string[]> = {
  hospitality: ['hero', 'menu highlights', 'gallery', 'hours+map', 'reservations CTA', 'reviews'],
  appointment: ['hero', 'services + indicative pricing', 'team', 'booking CTA', 'hours+map', 'reviews'],
  trades: ['hero with phone CTA', 'services grid', 'service area map', 'why us', 'quote form', 'reviews'],
  professional: ['hero', 'practice areas', 'credentials', 'case-style proof', 'contact form'],
  retail: ['hero', 'categories', 'featured products', 'store info', 'hours+map'],
  fitness: ['hero', 'classes/timetable', 'membership tiers', 'trial CTA', 'gallery'],
};

/**
 * Website generation (spec §9): select template + inject content brief + LLM copy (guarded) +
 * licensed/placeholder images → deterministic Astro build → GeneratedSite record.
 */
@Injectable()
export class GeneratorService {
  private readonly log = new Logger(GeneratorService.name);
  private images: ImageSource;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly llm: LlmService,
    private readonly profiling: ProfilingService,
    private readonly leadEvents: LeadEventsService,
    private readonly pipeline: PipelineService,
    private readonly links: LinkTokenService,
    private readonly gate: GateService,
    private readonly builder: AstroSiteBuilder,
  ) {
    this.images = new UnsplashSource(env.UNSPLASH_ACCESS_KEY);
  }

  setImageSource(s: ImageSource) {
    this.images = s;
  }

  templates() {
    return TEMPLATE_FAMILIES.map((id) => ({
      id, sections: TEMPLATE_SECTIONS[id], colourSchemes: [...COLOUR_SCHEMES], typography: [...TYPOGRAPHY_PAIRINGS],
      verticals: (Object.keys(VERTICAL_TEMPLATE) as Vertical[]).filter((v) => VERTICAL_TEMPLATE[v] === id),
    }));
  }

  async generate(leadId: string, opts: { templateId?: TemplateFamily; colourScheme?: 'a' | 'b' | 'c'; typography?: 'a' | 'b'; regenerateCopy?: boolean; advance?: boolean; reason?: string } = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { site: true } });
    if (lead.stage === 'suppressed' || lead.stage === 'excluded') throw new Error(`lead ${leadId} is ${lead.stage}`);
    // Gate runs before generation (spec §8). A blocked lead gets no mockup (no cost, no legal exposure).
    const g = await this.gate.evaluate(leadId, { context: 'pre-generation' });
    if (g.result !== 'clear') {
      await this.leadEvents.emit(leadId, 'generation.skipped', { reason: `legal gate ${g.reason}` });
      return { skipped: true as const, reason: g.reason };
    }
    const brief = await this.profiling.brief(leadId);
    const vertical = brief.classification.vertical;
    const template = opts.templateId ?? (lead.site?.templateId as TemplateFamily | undefined) ?? VERTICAL_TEMPLATE[vertical] ?? 'professional';
    const colourScheme = opts.colourScheme ?? (lead.site?.colourScheme as 'a' | 'b' | 'c' | undefined) ?? COLOUR_SCHEMES[seededIndex(lead.placeId, COLOUR_SCHEMES.length, 'cs')];
    const typography = opts.typography ?? (lead.site?.typography as 'a' | 'b' | undefined) ?? TYPOGRAPHY_PAIRINGS[seededIndex(lead.placeId, TYPOGRAPHY_PAIRINGS.length, 'ty')];

    let copy: SiteCopy;
    let violations: Violation[] = [];
    const existing = lead.site?.copy ? SiteCopySchema.safeParse(lead.site.copy) : null;
    if (existing?.success && !opts.regenerateCopy) copy = existing.data;
    else {
      const r = await this.writeCopy(leadId, lead.campaignId, brief, TEMPLATE_SECTIONS[template]);
      copy = r.copy;
      violations = r.violations;
    }

    const slug = lead.site?.previewSlug ?? newSlug();
    const expiresAt = lead.site?.expiresAt && lead.site.expiresAt > new Date() ? lead.site.expiresAt : new Date(Date.now() + this.env.PREVIEW_TTL_DAYS * 86400_000);
    const images = await selectImages(this.images, vertical, lead.placeId);
    const input: SiteBuildInput = {
      template, colourScheme, typography, brief, copy, images,
      mockup: {
        agencyName: this.env.AGENCY_NAME, agencyUrl: this.env.AGENCY_URL, businessName: lead.businessName, previewSlug: slug,
        formEndpoint: `${this.env.APP_BASE_URL}/p/${slug}/form`, takedownUrl: this.links.takedownUrl(leadId), expiresAt: expiresAt.toISOString(),
        mapEmbedUrl: brief.lat != null && brief.lng != null ? `https://www.google.com/maps?q=${brief.lat},${brief.lng}&z=15&output=embed` : null,
      },
    };
    const outDir = path.resolve(this.env.BUILD_WORK_DIR, slug);
    const build = await this.builder.build(input, outDir);
    if (build.ms > 20_000) this.log.warn({ leadId, ms: build.ms }, 'site build exceeded the 20 s target');

    const site = await this.prisma.generatedSite.upsert({
      where: { leadId },
      create: { leadId, templateId: template, colourScheme, typography, contentBrief: brief as unknown as Prisma.InputJsonValue, copy: copy as unknown as Prisma.InputJsonValue, copyViolations: violations as unknown as Prisma.InputJsonValue, buildHash: build.buildHash, previewSlug: slug, buildPath: outDir, expiresAt },
      update: { templateId: template, colourScheme, typography, contentBrief: brief as unknown as Prisma.InputJsonValue, copy: copy as unknown as Prisma.InputJsonValue, copyViolations: violations as unknown as Prisma.InputJsonValue, buildHash: build.buildHash, buildPath: outDir, expiresAt, takenDownAt: null },
    });
    await this.leadEvents.emit(leadId, 'site.built', { template, colourScheme, typography, buildHash: build.buildHash, ms: build.ms, violations: violations.length, reason: opts.reason ?? null });
    if (lead.stage === 'profiled') await this.leadEvents.advance(leadId, 'generated', { template });
    if (opts.advance ?? true) await this.pipeline.enqueue('previewPublish', 'publish', leadId, {}, { force: true });
    return { skipped: false as const, site, build, violations };
  }

  /** LLM copy + hallucination guard with one targeted regeneration per violating field, then neutral fallback. */
  async writeCopy(leadId: string, campaignId: string, brief: ContentBrief, sections: string[]): Promise<{ copy: SiteCopy; violations: Violation[] }> {
    const allowed = [...brief.verifiedFacts, ...brief.reviewExcerpts, brief.editorialSummary ?? '', ...brief.classification.servicesOffered, ...brief.classification.differentiators];
    const { value } = await this.llm.completeJson(
      { system: copySystem(brief.languageCode, brief.classification.toneOfVoice), user: copyUser(brief, sections), temperature: 0.4, maxTokens: 1800, purpose: 'copy', leadId, campaignId },
      SiteCopySchema,
    );
    const copy: SiteCopy = JSON.parse(JSON.stringify(value));
    const log: Violation[] = [];
    const first = checkCopy(copy, brief.verifiedFacts, allowed);
    log.push(...first);
    // One regeneration per violating field, naming every violation found in it.
    const byField = new Map<string, Violation[]>();
    for (const v of first) byField.set(v.field, [...(byField.get(v.field) ?? []), v]);
    for (const [field, vs] of byField) {
      const v = { ...vs[0], match: vs.map((x) => `${x.pattern}: "${x.match}"`).join('; ') };
      const previous = String(getPath(copy, field) ?? '');
      let fixed = false;
      try {
        const r = await this.llm.completeJson(
          { system: copySystem(brief.languageCode, brief.classification.toneOfVoice), user: regenerateFieldUser(brief, field, previous, v.match), temperature: 0.2, maxTokens: 300, purpose: 'copy', leadId, campaignId },
          z.object({ value: z.string().min(1) }),
        );
        const again = checkCopy({ [field]: r.value.value }, brief.verifiedFacts, allowed);
        if (!again.length) {
          setPath(copy, field, r.value.value);
          fixed = true;
        } else log.push(...again.map((a) => ({ ...a, field })));
      } catch (e) {
        this.log.warn({ leadId, field, err: (e as Error).message }, 'field regeneration failed');
      }
      if (!fixed) {
        setPath(copy, field, neutralFor(field, { business: brief.businessName, city: brief.city ?? '' }));
        if (!copy.placeholdersUsed.includes(field)) copy.placeholdersUsed.push(field);
      }
    }
    for (const v of log) await this.leadEvents.emit(leadId, 'copy.violation', { ...v });
    if (log.length) this.log.warn({ leadId, violations: log.map((v) => `${v.field}:${v.pattern}`) }, 'copy violations (for prompt tuning)');
    return { copy: SiteCopySchema.parse(copy), violations: log };
  }

  async updateCopy(leadId: string, copy: unknown, actor: string) {
    const parsed = SiteCopySchema.parse(copy);
    const site = await this.prisma.generatedSite.findUniqueOrThrow({ where: { leadId } });
    const brief = site.contentBrief as unknown as ContentBrief;
    const violations = checkCopy(parsed, brief.verifiedFacts, [...brief.reviewExcerpts, brief.editorialSummary ?? '']);
    await this.prisma.generatedSite.update({ where: { leadId }, data: { copy: parsed as unknown as Prisma.InputJsonValue, copyViolations: violations as unknown as Prisma.InputJsonValue } });
    await this.leadEvents.emit(leadId, 'copy.edited', { actor, violations: violations.length });
    await this.pipeline.enqueue('generatorBuild', 'build', leadId, { reason: 'copy edited' }, { force: true });
    return { violations };
  }

  async recentBuilds(take = 50) {
    return this.prisma.generatedSite.findMany({ orderBy: { updatedAt: 'desc' }, take, include: { lead: { select: { id: true, businessName: true, vertical: true, countryCode: true, stage: true } } } });
  }
}
