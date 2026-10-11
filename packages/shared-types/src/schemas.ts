import { z } from 'zod';
import { CTAS, TONES, VERTICALS } from './enums';

export const ClassificationSchema = z.object({
  vertical: z.enum(VERTICALS),
  subVertical: z.string().max(60),
  servicesOffered: z.array(z.string()).max(8),
  differentiators: z.array(z.string()).max(4),
  toneOfVoice: z.enum(TONES),
  primaryCTA: z.enum(CTAS),
  languageCode: z.string().min(2).max(12),
  confidence: z.number().min(0).max(1),
  insufficientData: z.boolean(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const OpeningHoursSchema = z.array(z.object({ day: z.string(), hours: z.string() }));

export const ContentBriefSchema = z.object({
  businessName: z.string(),
  classification: ClassificationSchema,
  address: z.string().nullable(),
  city: z.string().nullable(),
  countryCode: z.string(),
  phone: z.string().nullable(),
  internationalPhone: z.string().nullable(),
  openingHours: OpeningHoursSchema,
  priceLevel: z.number().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  reviewExcerpts: z.array(z.string()).max(5),
  editorialSummary: z.string().nullable(),
  googleTypes: z.array(z.string()),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  competitiveContext: z.object({ sameTypeInTile: z.number(), withLiveSite: z.number(), share: z.number() }),
  languageCode: z.string(),
  /** Facts the copywriter may use verbatim. Anything else is unverifiable. */
  verifiedFacts: z.array(z.string()),
});
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const SiteCopySchema = z.object({
  meta: z.object({ title: z.string().max(70), description: z.string().max(170) }),
  hero: z.object({ headline: z.string(), subhead: z.string(), ctaLabel: z.string() }),
  about: z.object({ heading: z.string(), body: z.string() }),
  services: z.array(z.object({ name: z.string(), description: z.string() })).min(1).max(8),
  whyUs: z.array(z.object({ title: z.string(), body: z.string() })).min(1).max(4),
  cta: z.object({ heading: z.string(), body: z.string(), buttonLabel: z.string() }),
  placeholdersUsed: z.array(z.string()),
});
export type SiteCopy = z.infer<typeof SiteCopySchema>;

/** The full input an Astro template build receives. */
export const SiteBuildInputSchema = z.object({
  template: z.enum(['hospitality', 'appointment', 'trades', 'professional', 'retail', 'fitness']),
  colourScheme: z.enum(['a', 'b', 'c']),
  typography: z.enum(['a', 'b']),
  brief: ContentBriefSchema,
  copy: SiteCopySchema,
  images: z.array(z.object({ url: z.string(), alt: z.string(), credit: z.string().nullable(), placeholder: z.literal(true) })),
  mockup: z.object({
    agencyName: z.string(),
    agencyUrl: z.string(),
    businessName: z.string(),
    previewSlug: z.string(),
    formEndpoint: z.string(),
    takedownUrl: z.string(),
    expiresAt: z.string(),
    mapEmbedUrl: z.string().nullable(),
  }),
});
export type SiteBuildInput = z.infer<typeof SiteBuildInputSchema>;

export const TierSchema = z.object({
  buildFee: z.number(), monthly: z.number(), pages: z.number(), revisions: z.number(), updatesPerMonth: z.number(), label: z.string(),
});
export const PricingConfigSchema = z.object({
  currency: z.string(),
  tiers: z.object({ starter: TierSchema, business: TierSchema, premium: TierSchema }),
  addOns: z.object({
    contentManagement: z.object({ monthly: z.number(), updatesIncluded: z.number() }),
    maintenance: z.object({ monthly: z.number() }),
    seoLocal: z.object({ setup: z.number(), monthly: z.number() }),
    copywritingExtra: z.object({ perPage: z.number() }),
    ecommerce: z.object({ setup: z.number(), monthly: z.number() }),
    multilingual: z.object({ perLanguage: z.number(), monthly: z.number() }),
    domainAndEmail: z.object({ setup: z.number(), monthly: z.number() }),
    photography: z.object({ oneOff: z.number() }),
  }),
  countryMultipliers: z.record(z.string(), z.number()),
  currencyRates: z.record(z.string(), z.number()),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;
export type TierName = 'starter' | 'business' | 'premium';

export const ScoreBreakdownSchema = z.object({
  contactability: z.number(),
  revenueProxy: z.number(),
  digitalGap: z.number(),
  qualitySignal: z.number(),
  competitivePressure: z.number(),
  score: z.number(),
  weights: z.object({ contactability: z.number(), revenueProxy: z.number(), digitalGap: z.number(), qualitySignal: z.number(), competitivePressure: z.number() }),
  inputs: z.record(z.string(), z.unknown()),
  hardExcluded: z.boolean(),
  hardExcludeReason: z.string().nullable(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const CampaignGeometrySchema = z.union([
  z.object({ kind: z.literal('bbox'), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  z.object({ kind: z.literal('circle'), center: z.object({ lat: z.number(), lng: z.number() }), radiusM: z.number().positive() }),
  z.object({ kind: z.literal('polygon'), geojson: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }) }),
  z.object({ kind: z.literal('cities'), cities: z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number(), radiusM: z.number().positive() })).min(1) }),
]);
export type CampaignGeometry = z.infer<typeof CampaignGeometrySchema>;

export const SequenceStepSchema = z.object({ step: z.number().int().min(1).max(4), delayDays: z.number().min(0), kind: z.enum(['opener', 'nudge', 'quote', 'closeout']), notes: z.string().optional() });
export const SequenceConfigSchema = z.array(SequenceStepSchema).max(4);
export type SequenceStep = z.infer<typeof SequenceStepSchema>;

export interface JurisdictionPolicy {
  countryCode: string;
  b2bColdEmailAllowed: boolean;
  soleTraderTreatedAsIndividual: boolean;
  priorConsentRequired: boolean;
  requiresPhysicalAddressInFooter: boolean;
  requiresDataSourceDisclosure: boolean;
  maxFollowUps: number;
  optOutHonourWindowHours: number;
  defaultLanguageCode: string;
  defaultCurrency: string;
  notes: string;
}
