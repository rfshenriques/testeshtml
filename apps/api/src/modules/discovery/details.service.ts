import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PLACES_CLIENT, PlacesApi, PlaceDetails, placesCostContext } from './places.provider';
import { SNAPSHOT_TTL_DAYS } from './discovery.service';
import { CampaignService } from '../territory/campaign.service';

/** Place Details for qualified leads only (spec §6.1): phone, hours, price level, editorial summary, reviews. */
@Injectable()
export class DetailsService {
  private readonly log = new Logger(DetailsService.name);
  constructor(private readonly prisma: PrismaService, @Inject(PLACES_CLIENT) private readonly places: PlacesApi, private readonly campaigns: CampaignService) {}

  async fetch(leadId: string): Promise<PlaceDetails | null> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { campaign: true } });
    const fresh = await this.latestSnapshot(lead.placeId);
    if (fresh) return fresh;
    if (!(await this.campaigns.canSpend(lead.campaignId))) {
      this.log.warn({ leadId }, 'details skipped: campaign cannot spend');
      return null;
    }
    placesCostContext.current = { campaignId: lead.campaignId, leadId };
    const d = await this.places.details(lead.placeId, { languageCode: lead.campaign.languageCode ?? undefined });
    await this.prisma.$transaction(async (tx) => {
      await tx.placeSnapshot.create({ data: { placeId: lead.placeId, kind: 'details', raw: (d.raw ?? d) as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + SNAPSHOT_TTL_DAYS * 86400_000) } });
      await tx.placeRef.update({ where: { placeId: lead.placeId }, data: { lastSeenAt: new Date() } });
      await tx.lead.update({
        where: { id: leadId },
        data: {
          phone: d.nationalPhoneNumber ?? d.internationalPhoneNumber ?? lead.phone,
          priceLevel: d.priceLevel ?? lead.priceLevel,
          rating: d.rating ?? lead.rating,
          reviewCount: d.userRatingCount ?? lead.reviewCount,
          businessStatus: d.businessStatus ?? lead.businessStatus,
          photoCount: d.photos?.length ?? lead.photoCount,
          websiteUrl: lead.websiteUrl ?? d.websiteUri ?? null,
          city: lead.city ?? cityFromComponents(d.addressComponents),
        },
      });
    });
    await this.campaigns.checkBudget(lead.campaignId);
    return d;
  }

  /** The latest unexpired details snapshot, normalised, or null. */
  async latestSnapshot(placeId: string): Promise<PlaceDetails | null> {
    const snap = await this.prisma.placeSnapshot.findFirst({ where: { placeId, kind: 'details', expiresAt: { gt: new Date() } }, orderBy: { fetchedAt: 'desc' } });
    if (!snap) return null;
    return normaliseDetails(snap.raw as Record<string, any>);
  }
}

export function cityFromComponents(components: PlaceDetails['addressComponents'] | undefined): string | null {
  if (!components) return null;
  const pick = (t: string) => components.find((c) => c.types.includes(t))?.longText ?? null;
  return pick('locality') ?? pick('postal_town') ?? pick('administrative_area_level_3') ?? pick('administrative_area_level_2');
}

/** Normalise a raw Places details JSON (as stored in the snapshot) into PlaceDetails. Tolerates both raw and already-normalised shapes. */
export function normaliseDetails(raw: Record<string, any>): PlaceDetails {
  const text = (v: any) => (typeof v === 'string' ? v : v?.text ?? null);
  return {
    id: raw.id, displayName: text(raw.displayName), formattedAddress: raw.formattedAddress ?? null,
    location: raw.location ? { lat: raw.location.latitude ?? raw.location.lat, lng: raw.location.longitude ?? raw.location.lng } : null,
    primaryType: raw.primaryType ?? null, types: raw.types ?? [], websiteUri: raw.websiteUri ?? null, businessStatus: raw.businessStatus ?? null,
    rating: raw.rating ?? null, userRatingCount: raw.userRatingCount ?? null, raw,
    nationalPhoneNumber: raw.nationalPhoneNumber ?? null, internationalPhoneNumber: raw.internationalPhoneNumber ?? null,
    regularOpeningHours: raw.regularOpeningHours ? { weekdayDescriptions: raw.regularOpeningHours.weekdayDescriptions ?? [] } : null,
    priceLevel: typeof raw.priceLevel === 'number' ? raw.priceLevel : priceLevelFromEnum(raw.priceLevel),
    editorialSummary: text(raw.editorialSummary),
    reviews: (raw.reviews ?? []).map((r: any) => ({ text: text(r.text) ?? '', rating: r.rating ?? null })),
    photos: (raw.photos ?? []).map((p: any) => ({ name: p.name, authorAttributions: p.authorAttributions ?? [] })),
    addressComponents: raw.addressComponents ?? [],
  };
}

function priceLevelFromEnum(v: unknown): number | null {
  const map: Record<string, number> = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
  return typeof v === 'string' && v in map ? map[v] : null;
}
