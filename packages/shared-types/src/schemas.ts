import { z } from 'zod';
import { COLOUR_SCHEMES, CTAS, TEMPLATE_FAMILIES, TONES, TYPOGRAPHY_PAIRINGS, VERTICALS } from './enums';

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
/** Palette derived from the lead's own material (Google listing photos). Hex colours; the templates enforce contrast. */
export const BrandSchema = z.object({
  source: z.enum(['photos', 'operator']),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  heroBg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  swatches: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).default([]),
});
export type Brand = z.infer<typeof BrandSchema>;

export const SiteImageSchema = z.object({
  url: z.string(), alt: z.string(), credit: z.string().nullable(), placeholder: z.literal(true),
  source: z.enum(['google_places', 'unsplash', 'operator']).optional(),
});
export type SiteImage = z.infer<typeof SiteImageSchema>;

export const SiteBuildInputSchema = z.object({
  template: z.enum(TEMPLATE_FAMILIES),
  /** a|b|c are the template's fixed schemes; brand|brand2|brand3 derive the palette from input.brand (fall back to a). */
  colourScheme: z.enum(COLOUR_SCHEMES),
  typography: z.enum(TYPOGRAPHY_PAIRINGS),
  brief: ContentBriefSchema,
  copy: SiteCopySchema,
  images: z.array(SiteImageSchema),
  brand: BrandSchema.nullable().optional(),
  mockup: z.object({
    agencyName: z.string(),
    agencyUrl: z.string(),
    businessName: z.string(),
    previewSlug: z.string(),
    formEndpoint: z.string(),
    takedownUrl: z.string(),
    expiresAt: z.string(),
    mapEmbedUrl: z.string().nullable(),
    /** Hosted booking page for this mockup: the site's "book" actions link here instead of an enquiry form. */
    bookingUrl: z.string(),
  }),
});
export type SiteBuildInput = z.infer<typeof SiteBuildInputSchema>;

export const TierSchema = z.object({
  buildFee: z.number(), monthly: z.number(), pages: z.number(), revisions: z.number(), updatesPerMonth: z.number(), label: z.string(),
  /** Google-review / website NFC tags shipped with the plan (business 1, premium 2). Extras via the nfcTagExtra add-on. */
  nfcTags: z.number().int().min(0).default(0),
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
    nfcTagExtra: z.object({ perTag: z.number() }).default({ perTag: 15 }),
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

// ---- Scheduling (bookable calls with the operator; simulated bookings on mockups)
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
export const TimeRangeSchema = z.tuple([HHMM, HHMM]);
export const AvailabilitySchema = z.object({
  /** IANA zone the weekly hours are expressed in. */
  timezone: z.string().min(1),
  slotMinutes: z.number().int().min(10).max(120),
  bufferMinutes: z.number().int().min(0).max(120),
  /** Earliest bookable slot is this many hours from now. */
  minNoticeHours: z.number().min(0).max(168),
  /** How far ahead the booking page offers slots. */
  horizonDays: z.number().int().min(1).max(90),
  hours: z.record(z.enum(DAY_KEYS), z.array(TimeRangeSchema)),
  /** Private iCal feed (e.g. Google Calendar "secret address in iCal format"); its events block slots. */
  busyFeedUrl: z.string().url().nullable(),
  /** Where new bookings and cancellations are announced; also receives the calendar file. */
  notifyEmail: z.string().email().nullable(),
  meetingTitle: z.string().min(1).max(120),
  /** Emails before the call: `confirm` ones ask the booker to confirm (one click) and count as the forced confirmation. */
  reminders: z.array(z.object({ hoursBefore: z.number().positive().max(24 * 30), confirm: z.boolean() })).max(6),
});
export type Availability = z.infer<typeof AvailabilitySchema>;
export const MEETING_STATUSES = ['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const MEETING_KINDS = ['agency_call', 'mockup_demo'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
