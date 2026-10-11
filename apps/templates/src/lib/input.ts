/**
 * Build-time helpers shared by the layout and every template family.
 *
 * The page frontmatter reads the SiteBuildInput from the JSON file named by the
 * SITEWRIGHT_INPUT env var (set by scripts/build-site.ts). Nothing here may
 * invent facts: every string rendered on a page traces back to input.copy,
 * input.brief or input.mockup.
 */
import { readFileSync } from 'node:fs';
import { SiteBuildInputSchema, type SiteBuildInput, type SiteCopy, type Vertical } from '@sitewright/shared-types';

export type BuildInput = SiteBuildInput;
export type ImageInput = SiteBuildInput['images'][number];

/** Returns the validated input, or null when no SITEWRIGHT_INPUT is set (plain `astro build`). */
export function loadBuildInput(): BuildInput | null {
  const file = process.env.SITEWRIGHT_INPUT;
  if (!file) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return SiteBuildInputSchema.parse(raw);
}

/**
 * True when copy.placeholdersUsed names this field (exact path, a parent path, or
 * the bare leaf name), e.g. "about.body", "about", "services[2].description",
 * "services", "hero.subhead", "body".
 */
export function isPlaceholder(copy: SiteCopy, path: string): boolean {
  const used = copy.placeholdersUsed.map((s) => s.trim().toLowerCase());
  const p = path.toLowerCase();
  const leaf = p.split('.').pop() ?? p;
  for (const u of used) {
    if (u === p) return true;
    if (p.startsWith(u + '.') || p.startsWith(u + '[')) return true;
    if (u === leaf) return true;
  }
  return false;
}

export const PLACEHOLDER_TEXT = 'To be supplied by the business';

/** Text to render for a copy field, respecting placeholdersUsed. */
export function copyText(copy: SiteCopy, path: string, value: string): { text: string; placeholder: boolean } {
  if (isPlaceholder(copy, path) || value.trim() === '') return { text: PLACEHOLDER_TEXT, placeholder: true };
  return { text: value, placeholder: false };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Deterministic, locale-independent date formatting (UTC): "11 November 2026". */
export function formatDate(iso: string): { human: string; iso: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { human: iso, iso };
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return { human: `${day} ${month} ${year}`, iso: d.toISOString().slice(0, 10) };
}

/** Google price level (0-4) rendered as a neutral indicator; null when unknown. */
export function priceLevelLabel(level: number | null): string | null {
  if (level === null || !Number.isFinite(level) || level <= 0) return null;
  const n = Math.min(4, Math.round(level));
  return '€'.repeat(n);
}

export function telHref(phone: string | null, international: string | null): string | null {
  const raw = international ?? phone;
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/** schema.org subtype used as `additionalType` next to the LocalBusiness type. */
export const SCHEMA_SUBTYPE: Record<Vertical, string | null> = {
  restaurant: 'Restaurant', cafe: 'CafeOrCoffeeShop', bar: 'BarOrPub', bakery: 'Bakery', salon: 'BeautySalon', spa: 'DaySpa',
  gym: 'ExerciseGym', dental: 'Dentist', medical: 'MedicalBusiness', veterinary: 'VeterinaryCare', legal: 'LegalService',
  accounting: 'AccountingService', realestate: 'RealEstateAgent', trades: 'HomeAndConstructionBusiness', automotive: 'AutoRepair',
  retail: 'Store', education: null, events: 'EventVenue', hospitality: 'LodgingBusiness', professional_services: 'ProfessionalService', other: null,
};

/** LocalBusiness JSON-LD built only from brief facts (spec §9.2). */
export function localBusinessJsonLd(input: BuildInput): Record<string, unknown> {
  const { brief } = input;
  const subtype = SCHEMA_SUBTYPE[brief.classification.vertical];
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: brief.businessName,
  };
  if (subtype) ld.additionalType = `https://schema.org/${subtype}`;
  if (input.copy.meta.description) ld.description = input.copy.meta.description;
  if (brief.address || brief.city) {
    ld.address = {
      '@type': 'PostalAddress',
      ...(brief.address ? { streetAddress: brief.address } : {}),
      ...(brief.city ? { addressLocality: brief.city } : {}),
      addressCountry: brief.countryCode,
    };
  }
  const phone = brief.internationalPhone ?? brief.phone;
  if (phone) ld.telephone = phone;
  if (brief.openingHours.length) ld.openingHours = brief.openingHours.map((h) => `${h.day} ${h.hours}`);
  if (brief.lat !== null && brief.lng !== null) ld.geo = { '@type': 'GeoCoordinates', latitude: brief.lat, longitude: brief.lng };
  if (brief.rating !== null && brief.reviewCount !== null && brief.reviewCount > 0) {
    ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: brief.rating, reviewCount: brief.reviewCount };
  }
  if (brief.priceLevel !== null) {
    const label = priceLevelLabel(brief.priceLevel);
    if (label) ld.priceRange = label;
  }
  return ld;
}

/** JSON safe for embedding in a <script> element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

/** Hero takes images[0]; galleries take the rest (wrapping around when a template needs more slots). */
export function pickImages(input: BuildInput): { hero: ImageInput | undefined; gallery: ImageInput[] } {
  const [hero, ...rest] = input.images;
  return { hero, gallery: rest };
}

export function starString(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
