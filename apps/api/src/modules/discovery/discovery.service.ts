import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, Tile } from '@sitewright/db';
import { CampaignGeometrySchema, PLACE_TYPE_VERTICAL } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CampaignService } from '../territory/campaign.service';
import { TilerService } from '../territory/tiler.service';
import { BBox, bboxCenter, bboxCircumradiusM, pointInGeometry } from '../territory/geometry';
import { PLACES_CLIENT, PlacesApi, PlacesSearchResult, placesCostContext } from './places.provider';
import { LeadEventsService } from '../crm/lead-events.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { AlertService } from '../ops/alert.service';

export const SNAPSHOT_TTL_DAYS = 30;
const PAGE_SIZE = 20;

export interface TileOutcome {
  tileId: string;
  status: 'done' | 'saturated' | 'failed' | 'skipped';
  results: number;
  newLeads: number;
  children: string[];
  reason?: string;
}

/**
 * Discovery (spec §5.2, §6.1): process one tile — for each included type, Nearby Search with the
 * circumscribing radius; saturated (20 results) tiles subdivide; results are upserted as PlaceRef +
 * expiring PlaceSnapshot + Lead(discovered), deduped by place_id per campaign.
 */
@Injectable()
export class DiscoveryService {
  private readonly log = new Logger(DiscoveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PLACES_CLIENT) private readonly places: PlacesApi,
    private readonly campaigns: CampaignService,
    private readonly tiler: TilerService,
    private readonly leadEvents: LeadEventsService,
    private readonly pipeline: PipelineService,
    private readonly alerts: AlertService,
  ) {}

  async processTile(tileId: string, opts: { enqueueChildren?: boolean; enqueueLeads?: boolean } = {}): Promise<TileOutcome> {
    const enqueueChildren = opts.enqueueChildren ?? true;
    const enqueueLeads = opts.enqueueLeads ?? true;
    const tile = await this.prisma.tile.findUnique({ where: { id: tileId } });
    if (!tile) return { tileId, status: 'skipped', results: 0, newLeads: 0, children: [], reason: 'tile not found' };
    if (tile.status === 'done' || tile.status === 'saturated') return { tileId, status: 'skipped', results: tile.resultCount, newLeads: 0, children: [], reason: `already ${tile.status}` };
    const campaign = await this.campaigns.get(tile.campaignId);
    if (campaign.status !== 'running') return { tileId, status: 'skipped', results: 0, newLeads: 0, children: [], reason: `campaign ${campaign.status}` };
    if (!(await this.campaigns.canSpend(campaign.id))) return { tileId, status: 'skipped', results: 0, newLeads: 0, children: [], reason: 'budget exhausted' };
    if (campaign.maxLeads) {
      const n = await this.prisma.lead.count({ where: { campaignId: campaign.id } });
      if (n >= campaign.maxLeads) {
        await this.prisma.tile.update({ where: { id: tileId }, data: { status: 'done', error: 'maxLeads reached' } });
        return { tileId, status: 'skipped', results: 0, newLeads: 0, children: [], reason: 'maxLeads reached' };
      }
    }

    await this.prisma.tile.update({ where: { id: tileId }, data: { status: 'searching' } });
    const geometry = CampaignGeometrySchema.parse(campaign.geometry);
    const bbox = tile.bbox as unknown as BBox;
    const center = bboxCenter(bbox);
    const radiusM = Math.min(50_000, Math.max(50, bboxCircumradiusM(bbox)));
    const types = campaign.includedTypes.filter((t) => !campaign.excludedTypes.includes(t));
    placesCostContext.current = { campaignId: campaign.id };

    let saturatedByType = false;
    let total = 0;
    let newLeads = 0;
    const liveByType = new Map<string, number>();
    try {
      for (const type of types) {
        const results = await this.places.searchNearby({ lat: center.lat, lng: center.lng, radiusM, includedTypes: [type], maxResultCount: PAGE_SIZE, languageCode: campaign.languageCode ?? undefined, regionCode: campaign.countryCode });
        total += results.length;
        const budget = await this.campaigns.checkBudget(campaign.id);
        if (results.length >= PAGE_SIZE && this.tiler.canSubdivide(tile).ok) {
          saturatedByType = true;
          // keep going through other types so their results are not lost, but this tile will subdivide.
        }
        for (const r of results) {
          if (r.location && !pointInGeometry(r.location, geometry)) continue;
          if (r.websiteUri) liveByType.set(type, (liveByType.get(type) ?? 0) + 1);
          const created = await this.upsertResult(campaign.id, campaign.countryCode, tile.id, r, type);
          if (created) {
            newLeads++;
            if (enqueueLeads) await this.pipeline.next(created, 'discovered');
          }
        }
        if (budget === 'paused') break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.tile.update({ where: { id: tileId }, data: { status: 'failed', error: msg } });
      this.log.error({ tileId, err: msg }, 'tile failed');
      throw e;
    }

    const liveSiteCount = [...liveByType.values()].reduce((a, b) => a + b, 0);
    if (saturatedByType) {
      const children = await this.tiler.saturate(tile, campaign, total);
      await this.prisma.tile.update({ where: { id: tileId }, data: { liveSiteCount } });
      if (enqueueChildren) await this.tiler.enqueue(children.map((c) => c.id));
      return { tileId, status: 'saturated', results: total, newLeads, children: children.map((c) => c.id) };
    }
    const sub = this.tiler.canSubdivide(tile);
    if (!sub.ok && total >= PAGE_SIZE * Math.max(1, types.length) * 0.5) {
      this.log.warn({ tileId, depth: tile.depth, total, reason: sub.reason }, 'tile still saturated at minimum size; accepting incompleteness');
    }
    await this.prisma.tile.update({ where: { id: tileId }, data: { status: 'done', resultCount: total, liveSiteCount } });
    await this.maybeComplete(campaign.id);
    return { tileId, status: 'done', results: total, newLeads, children: [] };
  }

  /** Returns the new lead id when a lead was created, null when deduped. Always refreshes PlaceRef + snapshot. */
  private async upsertResult(campaignId: string, countryCode: string, tileId: string, r: PlacesSearchResult, searchedType: string): Promise<string | null> {
    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_DAYS * 86400_000);
    return this.prisma.$transaction(async (tx) => {
      await tx.placeRef.upsert({ where: { placeId: r.id }, create: { placeId: r.id, countryCode }, update: { lastSeenAt: new Date() } });
      await tx.placeSnapshot.create({ data: { placeId: r.id, kind: 'search', raw: (r.raw ?? r) as Prisma.InputJsonValue, expiresAt } });
      const existing = await tx.lead.findUnique({ where: { campaignId_placeId: { campaignId, placeId: r.id } }, select: { id: true } });
      if (existing) return null;
      const primaryType = r.primaryType ?? searchedType;
      const lead = await tx.lead.create({
        data: {
          campaignId, placeId: r.id, tileId,
          businessName: r.displayName ?? '(unnamed)', primaryType, vertical: PLACE_TYPE_VERTICAL[primaryType] ?? null,
          countryCode, websiteUrl: r.websiteUri, websiteStatus: r.websiteUri ? 'unknown' : 'none',
          rating: r.rating, reviewCount: r.userRatingCount, businessStatus: r.businessStatus,
          lat: r.location?.lat ?? null, lng: r.location?.lng ?? null,
          city: cityFromAddress(r.formattedAddress),
          stage: 'discovered',
        },
      });
      await tx.leadEvent.create({ data: { leadId: lead.id, type: 'lead.discovered', payload: { tileId, searchedType, websiteUri: r.websiteUri } } });
      return lead.id;
    });
  }

  private async maybeComplete(campaignId: string) {
    if (await this.tiler.isCampaignFinished(campaignId)) {
      const c = await this.campaigns.get(campaignId);
      if (c.status === 'running') {
        await this.campaigns.complete(campaignId);
        await this.alerts.raise('campaign_complete', 'info', `Campaign "${c.name}" finished discovery`, { campaignId });
      }
    }
  }

  /** Same-type businesses in the tile that have a live website, as a share (spec §6.3 competitivePressure). */
  async competitivePressure(leadId: string): Promise<{ sameTypeInTile: number; withLiveSite: number; share: number }> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { tileId: true, primaryType: true, campaignId: true } });
    if (!lead.tileId) return { sameTypeInTile: 0, withLiveSite: 0, share: 0 };
    const [sameType, live] = await Promise.all([
      this.prisma.lead.count({ where: { tileId: lead.tileId, primaryType: lead.primaryType } }),
      this.prisma.lead.count({ where: { tileId: lead.tileId, primaryType: lead.primaryType, websiteStatus: 'live' } }),
    ]);
    // Leads with websites are only ever "live" after probing; before probing count websiteUrl presence.
    const withUrl = await this.prisma.lead.count({ where: { tileId: lead.tileId, primaryType: lead.primaryType, websiteUrl: { not: null } } });
    const withLiveSite = Math.max(live, withUrl);
    return { sameTypeInTile: sameType, withLiveSite, share: sameType ? withLiveSite / sameType : 0 };
  }
}

export function cityFromAddress(formatted: string | null): string | null {
  if (!formatted) return null;
  const parts = formatted.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // "Street 1, City POSTCODE, Country" → take the segment before the country, strip postcode-ish tokens.
  const seg = parts[parts.length - 2];
  const city = seg.replace(/\b[A-Z]{1,3}\s?\d{2,5}\b|\b\d{4,6}\b/g, '').replace(/\s{2,}/g, ' ').trim();
  return city || null;
}
