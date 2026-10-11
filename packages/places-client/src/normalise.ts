import type { PlaceDetails, PlacesSearchResult } from './types';

type AnyRecord = Record<string, unknown>;

function rec(v: unknown): AnyRecord {
  return v && typeof v === 'object' ? (v as AnyRecord) : {};
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Places API (New) returns priceLevel as an enum string; the contract exposes a 0..4 number. */
const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function priceLevelToNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v in PRICE_LEVELS ? PRICE_LEVELS[v] : null;
  return null;
}

export function normaliseSearchResult(raw: unknown): PlacesSearchResult {
  const p = rec(raw);
  const loc = rec(p.location);
  const lat = num(loc.latitude);
  const lng = num(loc.longitude);
  return {
    id: str(p.id) ?? '',
    displayName: str(rec(p.displayName).text),
    formattedAddress: str(p.formattedAddress),
    location: lat !== null && lng !== null ? { lat, lng } : null,
    primaryType: str(p.primaryType),
    types: strArray(p.types),
    websiteUri: str(p.websiteUri),
    businessStatus: str(p.businessStatus),
    rating: num(p.rating),
    userRatingCount: num(p.userRatingCount),
    raw,
  };
}

export function normaliseDetails(raw: unknown): PlaceDetails {
  const p = rec(raw);
  const base = normaliseSearchResult(raw);
  const hours = rec(p.regularOpeningHours);
  const weekday = strArray(hours.weekdayDescriptions);
  const reviews = Array.isArray(p.reviews)
    ? p.reviews.map((r) => {
        const rr = rec(r);
        return { text: str(rec(rr.text).text) ?? str(rec(rr.originalText).text) ?? '', rating: num(rr.rating) };
      })
    : [];
  const photos = Array.isArray(p.photos)
    ? p.photos.map((ph) => ({ name: str(rec(ph).name) ?? '' })).filter((ph) => ph.name.length > 0)
    : [];
  const addressComponents = Array.isArray(p.addressComponents)
    ? p.addressComponents.map((c) => {
        const cc = rec(c);
        return { longText: str(cc.longText) ?? '', shortText: str(cc.shortText) ?? '', types: strArray(cc.types) };
      })
    : [];
  return {
    ...base,
    nationalPhoneNumber: str(p.nationalPhoneNumber),
    internationalPhoneNumber: str(p.internationalPhoneNumber),
    regularOpeningHours: p.regularOpeningHours && typeof p.regularOpeningHours === 'object' ? { weekdayDescriptions: weekday } : null,
    priceLevel: priceLevelToNumber(p.priceLevel),
    editorialSummary: str(rec(p.editorialSummary).text),
    reviews,
    photos,
    addressComponents,
  };
}
