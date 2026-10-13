export const VERTICALS = [
  'restaurant', 'cafe', 'bar', 'bakery', 'salon', 'spa', 'gym', 'dental', 'medical', 'veterinary',
  'legal', 'accounting', 'realestate', 'trades', 'automotive', 'retail', 'education', 'events',
  'hospitality', 'professional_services', 'other',
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const TONES = ['warm', 'professional', 'premium', 'energetic', 'traditional', 'clinical'] as const;
export type Tone = (typeof TONES)[number];

export const CTAS = ['call', 'book', 'visit', 'quote', 'order', 'enquire'] as const;
export type PrimaryCta = (typeof CTAS)[number];

/**
 * Template families. Each family is a distinct site design (layout, blocks, shapes) built for how that
 * kind of business sells: a restaurant leads with its menu and room, a clinic with reassurance and booking,
 * a tradesperson with the phone number and a quote form, a law firm with practice areas and credentials.
 */
export const TEMPLATE_FAMILIES = ['hospitality', 'beauty', 'clinic', 'trades', 'automotive', 'professional', 'property', 'education', 'retail', 'fitness'] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export const TEMPLATE_FAMILY_LABEL: Record<TemplateFamily, string> = {
  hospitality: 'Hospitality', beauty: 'Beauty & barbers', clinic: 'Clinic & practice', trades: 'Trades', automotive: 'Automotive',
  professional: 'Professional services', property: 'Property', education: 'Education', retail: 'Retail', fitness: 'Fitness',
};

/** Vertical -> template family (spec §9.2, extended: one family per kind of business rather than six). */
export const VERTICAL_TEMPLATE: Record<Vertical, TemplateFamily> = {
  restaurant: 'hospitality', cafe: 'hospitality', bar: 'hospitality', bakery: 'hospitality', hospitality: 'hospitality', events: 'hospitality',
  salon: 'beauty', spa: 'beauty',
  dental: 'clinic', medical: 'clinic', veterinary: 'clinic',
  trades: 'trades',
  automotive: 'automotive',
  legal: 'professional', accounting: 'professional', professional_services: 'professional', other: 'professional',
  realestate: 'property',
  education: 'education',
  retail: 'retail',
  gym: 'fitness',
};

/**
 * Colour schemes. a|b|c are the family's fixed palettes; the `brand*` schemes are derived from the lead's own
 * material (listing photos / logo): `brand` light with their primary, `brand2` dark hero and footer from their
 * darkest tone, `brand3` the whole page tinted with their primary.
 */
export const COLOUR_SCHEMES = ['a', 'b', 'c', 'brand', 'brand2', 'brand3'] as const;
export type ColourSchemeId = (typeof COLOUR_SCHEMES)[number];
export const BRAND_SCHEMES: readonly ColourSchemeId[] = ['brand', 'brand2', 'brand3'];
export const COLOUR_SCHEME_LABEL: Record<ColourSchemeId, string> = {
  a: 'Scheme A', b: 'Scheme B', c: 'Scheme C', brand: 'Their colours', brand2: 'Their colours · dark', brand3: 'Their colours · tinted',
};

/** Typographic pairings (system font stacks only; see apps/templates/src/theme/tokens.ts). */
export const TYPOGRAPHY_PAIRINGS = ['a', 'b', 'c', 'd', 'e'] as const;
export type TypographyId = (typeof TYPOGRAPHY_PAIRINGS)[number];
export const TYPOGRAPHY_LABEL: Record<TypographyId, string> = { a: 'Editorial', b: 'Modern', c: 'Geometric', d: 'Classic', e: 'Technical' };

/** High-value Google place types (spec §5.3), weighted by willingness to pay and likelihood of lacking a website. */
export const PLACE_TYPE_TIERS = {
  A: ['dentist', 'lawyer', 'physiotherapist', 'veterinary_care', 'real_estate_agency', 'accounting', 'insurance_agency', 'plumber', 'electrician', 'roofing_contractor', 'general_contractor', 'moving_company', 'car_repair'],
  B: ['restaurant', 'cafe', 'bakery', 'bar', 'hair_care', 'beauty_salon', 'spa', 'gym', 'pet_store', 'florist', 'jewelry_store', 'furniture_store', 'tailor'],
  C: ['clothing_store', 'hardware_store', 'book_store', 'laundry', 'shoe_store'],
} as const;
export type PlaceTypeTier = keyof typeof PLACE_TYPE_TIERS;
export const TIER_VALUE: Record<PlaceTypeTier, number> = { A: 1.0, B: 0.6, C: 0.35 };

export function placeTypeTier(type: string | null | undefined): PlaceTypeTier | null {
  if (!type) return null;
  for (const [tier, types] of Object.entries(PLACE_TYPE_TIERS)) {
    if ((types as readonly string[]).includes(type)) return tier as PlaceTypeTier;
  }
  return null;
}

/** Google place type -> vertical hint, used before LLM classification and as a fallback. */
export const PLACE_TYPE_VERTICAL: Record<string, Vertical> = {
  dentist: 'dental', doctor: 'medical', physiotherapist: 'medical', veterinary_care: 'veterinary',
  lawyer: 'legal', accounting: 'accounting', insurance_agency: 'professional_services', real_estate_agency: 'realestate',
  plumber: 'trades', electrician: 'trades', roofing_contractor: 'trades', general_contractor: 'trades', moving_company: 'trades', painter: 'trades', locksmith: 'trades',
  car_repair: 'automotive', car_wash: 'automotive', car_dealer: 'automotive',
  restaurant: 'restaurant', cafe: 'cafe', coffee_shop: 'cafe', bakery: 'bakery', bar: 'bar', pub: 'bar',
  hair_care: 'salon', hair_salon: 'salon', beauty_salon: 'salon', nail_salon: 'salon', barber_shop: 'salon', spa: 'spa',
  gym: 'gym', fitness_center: 'gym', yoga_studio: 'gym',
  pet_store: 'retail', florist: 'retail', jewelry_store: 'retail', furniture_store: 'retail', tailor: 'retail',
  clothing_store: 'retail', hardware_store: 'retail', book_store: 'retail', laundry: 'retail', shoe_store: 'retail', store: 'retail',
  school: 'education', tutoring: 'education', event_venue: 'events', lodging: 'hospitality', hotel: 'hospitality',
};

export const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'instagram.com', 'linktr.ee', 'wa.me', 'tiktok.com', 'linkedin.com', 'yelp.com', 'tripadvisor.com', 'sites.google.com', 'business.site', 'twitter.com', 'x.com', 'whatsapp.com'];

export const REPLY_INTENTS = ['interested', 'question', 'not_interested', 'unsubscribe', 'out_of_office', 'hostile', 'other'] as const;
export type ReplyIntentValue = (typeof REPLY_INTENTS)[number];

/** Mailbox warmup schedule (spec §11.2). Index = week-1. Ceiling 50/mailbox/day, never exceeded. */
export const WARMUP_SCHEDULE = [5, 10, 20, 30, 40, 50] as const;
export const WARMUP_REAL_SHARE = [0, 0.2, 0.5, 0.8, 1, 1] as const;
export const MAILBOX_DAILY_CEILING = 50;
export const MAX_TOUCHES_PER_BUSINESS = 4;
/** The operator approves the first N outreach sends by hand (spec M8). */
export const HAND_APPROVAL_COUNT = 20;
