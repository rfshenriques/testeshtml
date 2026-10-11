import type { Classification, ContentBrief } from '@sitewright/shared-types';
import type { PlaceDetails } from '../discovery/places.provider';

export interface BriefLead {
  businessName: string; countryCode: string; city: string | null; phone: string | null; rating: number | null; reviewCount: number | null; priceLevel: number | null; lat: number | null; lng: number | null; primaryType: string | null;
}

/** The brief that drives generation (spec §7): Places details + classification + competitive context + language. Only verifiable facts. */
export function buildContentBrief(lead: BriefLead, details: PlaceDetails | null, classification: Classification, competitive: { sameTypeInTile: number; withLiveSite: number; share: number }, languageCode: string): ContentBrief {
  const hours = (details?.regularOpeningHours?.weekdayDescriptions ?? []).map((d) => {
    const [day, ...rest] = d.split(':');
    return { day: day.trim(), hours: rest.join(':').trim() };
  });
  const verifiedFacts: string[] = [`Business name: ${lead.businessName}`];
  if (details?.formattedAddress) verifiedFacts.push(`Address: ${details.formattedAddress}`);
  if (lead.city) verifiedFacts.push(`Located in ${lead.city}`);
  if (lead.phone ?? details?.nationalPhoneNumber) verifiedFacts.push(`Phone: ${lead.phone ?? details?.nationalPhoneNumber}`);
  if (hours.length) verifiedFacts.push(`Opening hours: ${hours.map((h) => `${h.day} ${h.hours}`).join('; ')}`);
  if (lead.rating != null && (lead.reviewCount ?? 0) >= 3) verifiedFacts.push(`Google rating ${lead.rating} from ${lead.reviewCount} reviews`);
  if (details?.priceLevel != null) verifiedFacts.push(`Price level ${details.priceLevel}/4`);
  return {
    businessName: lead.businessName,
    classification,
    address: details?.formattedAddress ?? null,
    city: lead.city,
    countryCode: lead.countryCode,
    phone: lead.phone ?? details?.nationalPhoneNumber ?? null,
    internationalPhone: details?.internationalPhoneNumber ?? null,
    openingHours: hours,
    priceLevel: details?.priceLevel ?? lead.priceLevel ?? null,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    reviewExcerpts: (details?.reviews ?? []).map((r) => r.text).filter(Boolean).slice(0, 5).map((t) => t.slice(0, 200)),
    editorialSummary: details?.editorialSummary ?? null,
    googleTypes: details?.types ?? (lead.primaryType ? [lead.primaryType] : []),
    lat: lead.lat, lng: lead.lng,
    competitiveContext: competitive,
    languageCode,
    verifiedFacts,
  };
}
