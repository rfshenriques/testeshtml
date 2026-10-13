import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { Brand, COLOUR_SCHEMES, ColourSchemeId, ContentBrief, SiteBuildInput, SiteCopy, SiteCopySchema, SiteImage, TEMPLATE_FAMILIES, TEMPLATE_FAMILY_LABEL, TemplateFamily, TYPOGRAPHY_PAIRINGS, TypographyId, VERTICAL_TEMPLATE, Vertical } from '@sitewright/shared-types';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { PlacePhotosService } from './place-photos.service';
import { extractBrand } from './brand';
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

/** Blocks per family, in page order (mirrors apps/templates/src/templates/index.ts). Also tells the copywriter what the page needs. */
export const TEMPLATE_SECTIONS: Record<TemplateFamily, string[]> = {
  hospitality: ['full-bleed hero', 'today strip (hours, rating, price level)', 'menu highlights', 'about', 'photo mosaic', 'hours+map', 'reservations band', 'reviews', 'reservation form'],
  beauty: ['editorial hero', 'service menu (price list)', 'what to expect (steps)', 'portrait gallery', 'about', 'reviews', 'booking panel + hours', 'booking form'],
  clinic: ['split hero with appointment card', 'reassurance checklist', 'treatments and services', 'first visit (steps)', 'about the practice', 'FAQ', 'reviews', 'hours+map', 'booking form'],
  trades: ['call bar', 'hero with inline quote form', 'service tiles', 'trust strip', 'service area + map', 'why us', 'reviews', 'quote form'],
  automotive: ['dark hero', 'book-a-service strip', 'services', 'how it works (steps)', 'workshop gallery', 'why us', 'reviews', 'hours+map', 'booking form'],
  professional: ['text hero', 'practice areas', 'how we work (steps)', 'credentials panel', 'client feedback (pull quote)', 'office + hours', 'consultation form'],
  property: ['photo hero with enquiry card', 'featured listings (placeholders)', 'services', 'area guide + map', 'about the agency', 'reviews', 'valuation form'],
  education: ['hero with two CTAs', 'programmes', 'how it works (steps)', 'why families choose us', 'about', 'FAQ', 'hours+map', 'reviews', 'enquiry form'],
  retail: ['info bar', 'split hero', 'category tiles', 'featured products', 'promo band', 'store info (hours + map)', 'reviews', 'contact form'],
  fitness: ['oversized hero', 'classes', 'weekly timetable (opening times)', 'membership', 'trial band', 'gallery', 'about', 'reviews', 'trial form'],
};

/** One line per family on how the design sells that kind of business (shown in the console's design studio). */
export const TEMPLATE_CONCEPT: Record<TemplateFamily, string> = {
  hospitality: 'Full-bleed photography, the menu up front, a visit strip with hours and price level, reservations.',
  beauty: 'Editorial, airy layout with large type, a price-list style service menu and a booking panel.',
  clinic: 'Trust first: reassurance checklist, an appointment card with phone and today’s hours, first-visit steps, FAQ.',
  trades: 'Phone-first: call bar, a quote form inside the hero, service tiles, service area, trust badges.',
  automotive: 'Dark workshop bands, a book-a-service strip, service cards, how it works, wide gallery.',
  professional: 'Conservative and text-led: no hero image, narrow measure, numbered practice areas, credentials, a pull quote.',
  property: 'Photographic hero with an enquiry card, placeholder listings, area guide with map, valuation form.',
  education: 'Friendly, rounded shapes: programmes as cards, how it works, FAQ, term hours, enquiry form.',
  retail: 'Shop-like: info bar, split hero on a tinted panel, category tiles, featured products, promo band.',
  fitness: 'High energy: oversized uppercase hero with a diagonal cut, classes, timetable, membership columns, trial form.',
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
    private readonly placePhotos: PlacePhotosService,
  ) {
    this.images = new UnsplashSource(env.UNSPLASH_ACCESS_KEY);
  }

  setImageSource(s: ImageSource) {
    this.images = s;
  }

  templates() {
    return TEMPLATE_FAMILIES.map((id) => ({
      id, label: TEMPLATE_FAMILY_LABEL[id], concept: TEMPLATE_CONCEPT[id], sections: TEMPLATE_SECTIONS[id], colourSchemes: [...COLOUR_SCHEMES], typography: [...TYPOGRAPHY_PAIRINGS],
      verticals: (Object.keys(VERTICAL_TEMPLATE) as Vertical[]).filter((v) => VERTICAL_TEMPLATE[v] === id),
    }));
  }

  /**
   * Everything a build needs for a lead, in one place. Copy is generated once and reused; listing
   * photos + the derived brand palette are fetched once and stored on the site record.
   */
  async assembleInput(leadId: string, opts: { templateId?: TemplateFamily; colourScheme?: ColourSchemeId; typography?: TypographyId; regenerateCopy?: boolean } = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { site: true } });
    if (lead.stage === 'suppressed' || lead.stage === 'excluded') throw new Error(`lead ${leadId} is ${lead.stage}`);
    const brief = await this.profiling.brief(leadId);
    const vertical = brief.classification.vertical;
    const slug = lead.site?.previewSlug ?? newSlug();
    const expiresAt = lead.site?.expiresAt && lead.site.expiresAt > new Date() ? lead.site.expiresAt : new Date(Date.now() + this.env.PREVIEW_TTL_DAYS * 86400_000);

    // Images + brand: reuse what is stored; otherwise fetch the listing's photos, else licensed stock.
    let images = (lead.site?.images as unknown as SiteImage[] | null) ?? null;
    let brand = (lead.site?.brand as unknown as Brand | null) ?? null;
    if (!images || !images.length) {
      const fetched = await this.placePhotos.fetchAndStore(leadId, lead.placeId, slug, lead.campaignId);
      if (fetched.length) {
        images = fetched.map((f) => f.image);
        brand = brand ?? (await extractBrand(fetched.map((f) => f.bytes)).catch(() => null));
      } else {
        images = await selectImages(this.images, vertical, lead.placeId);
      }
    }
    const template = opts.templateId ?? (lead.site?.templateId as TemplateFamily | undefined) ?? VERTICAL_TEMPLATE[vertical] ?? 'professional';
    const colourScheme: ColourSchemeId = opts.colourScheme ?? (lead.site?.colourScheme as ColourSchemeId | undefined) ?? (brand ? 'brand' : COLOUR_SCHEMES[seededIndex(lead.placeId, 3, 'cs')]);
    const typography = opts.typography ?? (lead.site?.typography as TypographyId | undefined) ?? TYPOGRAPHY_PAIRINGS[seededIndex(lead.placeId, TYPOGRAPHY_PAIRINGS.length, 'ty')];

    let copy: SiteCopy;
    let violations: Violation[] = [];
    const existing = lead.site?.copy ? SiteCopySchema.safeParse(lead.site.copy) : null;
    if (existing?.success && !opts.regenerateCopy) copy = existing.data;
    else {
      const r = await this.writeCopy(leadId, lead.campaignId, brief, TEMPLATE_SECTIONS[template]);
      copy = r.copy;
      violations = r.violations;
    }
    // Persist what was assembled (copy, photos, palette) even before the first build so the style gallery and
    // the public photo URLs work, and nothing is fetched or written twice.
    await this.prisma.generatedSite.upsert({
      where: { leadId },
      create: { leadId, previewSlug: slug, templateId: template, colourScheme, typography, contentBrief: brief as unknown as Prisma.InputJsonValue, copy: copy as unknown as Prisma.InputJsonValue, copyViolations: violations as unknown as Prisma.InputJsonValue, brand: (brand ?? null) as unknown as Prisma.InputJsonValue, images: images as unknown as Prisma.InputJsonValue, buildHash: 'pending', expiresAt, objectPrefix: images.some((i) => i.source === 'google_places') ? `previews/${slug}/` : null },
      update: { copy: copy as unknown as Prisma.InputJsonValue, brand: (brand ?? null) as unknown as Prisma.InputJsonValue, images: images as unknown as Prisma.InputJsonValue, ...(images.some((i) => i.source === 'google_places') && !lead.site?.objectPrefix ? { objectPrefix: `previews/${slug}/` } : {}) },
    });
    const input: SiteBuildInput = {
      template, colourScheme, typography, brief, copy, images, brand,
      mockup: {
        agencyName: this.env.AGENCY_NAME, agencyUrl: this.env.AGENCY_URL, businessName: lead.businessName, previewSlug: slug,
        formEndpoint: `${this.env.APP_BASE_URL}/p/${slug}/form`, takedownUrl: this.links.takedownUrl(leadId), expiresAt: expiresAt.toISOString(),
        mapEmbedUrl: brief.lat != null && brief.lng != null ? `https://www.google.com/maps?q=${brief.lat},${brief.lng}&z=15&output=embed` : null,
        bookingUrl: `${this.env.APP_BASE_URL}/p/${slug}/book`,
      },
    };
    return { lead, input, slug, expiresAt, violations, brief };
  }

  async generate(leadId: string, opts: { templateId?: TemplateFamily; colourScheme?: ColourSchemeId; typography?: TypographyId; regenerateCopy?: boolean; advance?: boolean; reason?: string } = {}) {
    // Gate runs before generation (spec §8). A blocked lead gets no mockup (no cost, no legal exposure).
    const g = await this.gate.evaluate(leadId, { context: 'pre-generation' });
    if (g.result !== 'clear') {
      await this.leadEvents.emit(leadId, 'generation.skipped', { reason: `legal gate ${g.reason}` });
      return { skipped: true as const, reason: g.reason };
    }
    const { lead, input, slug, expiresAt, violations, brief } = await this.assembleInput(leadId, opts);
    const outDir = path.resolve(this.env.BUILD_WORK_DIR, slug);
    const build = await this.builder.build(input, outDir);
    if (build.ms > 20_000) this.log.warn({ leadId, ms: build.ms }, 'site build exceeded the 20 s target');
    const data = {
      templateId: input.template, colourScheme: input.colourScheme, typography: input.typography,
      contentBrief: brief as unknown as Prisma.InputJsonValue, copy: input.copy as unknown as Prisma.InputJsonValue, copyViolations: violations as unknown as Prisma.InputJsonValue,
      brand: (input.brand ?? null) as unknown as Prisma.InputJsonValue, images: input.images as unknown as Prisma.InputJsonValue,
      buildHash: build.buildHash, buildPath: outDir, expiresAt,
    };
    const site = await this.prisma.generatedSite.upsert({
      where: { leadId },
      create: { leadId, previewSlug: slug, ...data },
      update: { ...data, takenDownAt: null },
    });
    await this.leadEvents.emit(leadId, 'site.built', { template: input.template, colourScheme: input.colourScheme, typography: input.typography, buildHash: build.buildHash, ms: build.ms, violations: violations.length, brand: input.brand?.source ?? null, photos: input.images.filter((i) => i.source === 'google_places').length, reason: opts.reason ?? null });
    if (lead.stage === 'profiled') await this.leadEvents.advance(leadId, 'generated', { template: input.template });
    if (opts.advance ?? true) await this.pipeline.enqueue('previewPublish', 'publish', leadId, {}, { force: true });
    return { skipped: false as const, site, build, violations };
  }

  /** Style gallery: every family × scheme × typography for a lead, built on demand and cached by input hash. */
  async variantHtml(leadId: string, template: TemplateFamily, colourScheme: ColourSchemeId, typography: TypographyId): Promise<string> {
    if (!TEMPLATE_FAMILIES.includes(template) || !COLOUR_SCHEMES.includes(colourScheme) || !TYPOGRAPHY_PAIRINGS.includes(typography)) throw new Error('unknown variant');
    const { input } = await this.assembleInput(leadId, { templateId: template, colourScheme, typography });
    const key = `${template}-${colourScheme}-${typography}`;
    const hash = createHash('sha256').update(JSON.stringify({ ...input, mockup: { ...input.mockup, expiresAt: '' } })).digest('hex').slice(0, 16);
    const dir = path.resolve(this.env.BUILD_WORK_DIR, 'variants', leadId);
    const cached = path.join(dir, `${key}-${hash}.html`);
    try {
      return await fs.readFile(cached, 'utf8');
    } catch { /* build below */ }
    const outDir = path.join(dir, `build-${key}`);
    await this.builder.build(input, outDir);
    const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(cached, html);
    await fs.rm(outDir, { recursive: true, force: true });
    return html;
  }

  async variants(leadId: string) {
    const site = await this.prisma.generatedSite.findUnique({ where: { leadId } });
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (!lead.classification) throw new Error('lead has no classification yet (profile it first)');
    let brand = (site?.brand as unknown as Brand | null) ?? null;
    let images = (site?.images as unknown as SiteImage[] | null) ?? [];
    if (!site) {
      // No site yet: assemble once so photos/brand exist for the gallery (no build).
      const a = await this.assembleInput(leadId).catch(() => null);
      brand = a?.input.brand ?? null;
      images = a?.input.images ?? [];
    }
    return {
      current: site ? { templateId: site.templateId, colourScheme: site.colourScheme, typography: site.typography } : null,
      brand, images,
      templates: this.templates().map((t) => ({ id: t.id, label: t.label, concept: t.concept, verticals: t.verticals, sections: t.sections })),
      colourSchemes: [...COLOUR_SCHEMES], typography: [...TYPOGRAPHY_PAIRINGS],
    };
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
