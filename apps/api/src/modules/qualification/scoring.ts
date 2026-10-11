import { placeTypeTier, TIER_VALUE, type ScoreBreakdown } from '@sitewright/shared-types';

export const WEIGHTS = { contactability: 0.3, revenueProxy: 0.25, digitalGap: 0.2, qualitySignal: 0.15, competitivePressure: 0.1 } as const;

export interface ScoreInput {
  primaryType: string | null;
  websiteStatus: 'none' | 'social_only' | 'parked' | 'broken' | 'http_only' | 'live' | 'unknown';
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  businessStatus: string | null;
  /** best contact state */
  contact: 'named_valid' | 'role_valid' | 'unverified' | 'phone_only' | 'none';
  competitivePressureShare: number; // 0..1 share of same-type businesses in the tile with a live site
}

const DIGITAL_GAP: Record<ScoreInput['websiteStatus'], number> = { none: 1.0, broken: 0.9, parked: 0.85, social_only: 0.75, http_only: 0.4, live: 0, unknown: 0.5 };
const CONTACT: Record<ScoreInput['contact'], number> = { named_valid: 1.0, role_valid: 0.75, unverified: 0.4, phone_only: 0.15, none: 0 };

/** Lead score (spec §6.3). Pure; the full breakdown is stored so the UI can explain the ranking. */
export function scoreLead(i: ScoreInput): ScoreBreakdown {
  const hardExcluded = !!i.businessStatus && i.businessStatus !== 'OPERATIONAL';
  const contactability = CONTACT[i.contact];
  const tier = placeTypeTier(i.primaryType);
  const tierValue = tier ? TIER_VALUE[tier] : 0.4;
  const price = i.priceLevel != null ? Math.min(1, Math.max(0, i.priceLevel) / 4) : null;
  const reviews = i.reviewCount ?? 0;
  const logReviews = Math.min(1, Math.log10(reviews + 1) / 3); // 0 → 0, 10 → 0.35, 100 → 0.67, 1000 → 1
  const revenueProxy = price != null ? 0.5 * tierValue + 0.2 * price + 0.3 * logReviews : 0.6 * tierValue + 0.4 * logReviews;
  const digitalGap = DIGITAL_GAP[i.websiteStatus];
  const qualitySignal = quality(i.rating, i.reviewCount);
  const competitivePressure = Math.min(1, Math.max(0, i.competitivePressureShare));
  const score = hardExcluded ? 0 : round(
    WEIGHTS.contactability * contactability + WEIGHTS.revenueProxy * revenueProxy + WEIGHTS.digitalGap * digitalGap + WEIGHTS.qualitySignal * qualitySignal + WEIGHTS.competitivePressure * competitivePressure,
  );
  return {
    contactability: round(contactability), revenueProxy: round(revenueProxy), digitalGap: round(digitalGap), qualitySignal: round(qualitySignal), competitivePressure: round(competitivePressure),
    score, weights: { ...WEIGHTS },
    inputs: { primaryType: i.primaryType, tier, tierValue, websiteStatus: i.websiteStatus, rating: i.rating, reviewCount: i.reviewCount, priceLevel: i.priceLevel, businessStatus: i.businessStatus, contact: i.contact, competitivePressureShare: i.competitivePressureShare },
    hardExcluded, hardExcludeReason: hardExcluded ? `businessStatus=${i.businessStatus}` : null,
  };
}

/** rating ≥ 4.0 && reviews ≥ 20 → 1.0; sliding to 0 for rating < 3.0 or reviews < 3. */
export function quality(rating: number | null, reviewCount: number | null): number {
  const r = rating ?? 0;
  const n = reviewCount ?? 0;
  if (r < 3.0 || n < 3) return 0;
  if (r >= 4.0 && n >= 20) return 1;
  const rPart = Math.min(1, (r - 3.0) / 1.0);
  const nPart = Math.min(1, (n - 3) / 17);
  return round(0.5 * rPart + 0.5 * nPart);
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
