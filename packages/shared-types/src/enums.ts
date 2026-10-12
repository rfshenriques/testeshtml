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

export const TEMPLATE_FAMILIES = ['hospitality', 'appointment', 'trades', 'professional', 'retail', 'fitness'] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

/** Vertical -> template family (spec §9.2). */
export const VERTICAL_TEMPLATE: Record<Vertical, TemplateFamily> = {
  restaurant: 'hospitality', cafe: 'hospitality', bar: 'hospitality', bakery: 'hospitality', hospitality: 'hospitality',
  salon: 'appointment', spa: 'appointment', dental: 'appointment', medical: 'appointment', veterinary: 'appointment',
  trades: 'trades', automotive: 'trades',
  legal: 'professional', accounting: 'professional', realestate: 'professional', professional_services: 'professional',
  education: 'professional', events: 'hospitality',
  retail: 'retail',
  gym: 'fitness',
  other: 'professional',
};

export const COLOUR_SCHEMES = ['a', 'b', 'c', 'brand'] as const;
export type ColourSchemeId = (typeof COLOUR_SCHEMES)[number];
export const TYPOGRAPHY_PAIRINGS = ['a', 'b'] as const;

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
