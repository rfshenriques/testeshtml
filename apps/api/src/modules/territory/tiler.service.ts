import { Injectable, Logger } from '@nestjs/common';
import { Campaign, Prisma, Tile } from '@sitewright/db';
import { CampaignGeometrySchema, QUEUES } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { BBox, bboxCircumradiusM, rootTiles, splitBBox, tileTouchesGeometry } from './geometry';

export const MAX_DEPTH = 8;
export const MIN_RADIUS_M = 100;

/** Recursive quadtree tiling (spec §5.2). Tiles are persisted; the discovery worker processes them. */
@Injectable()
export class TilerService {
  private readonly log = new Logger(TilerService.name);
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueRegistry) {}

  async createRootTiles(campaign: Campaign): Promise<Tile[]> {
    const geometry = CampaignGeometrySchema.parse(campaign.geometry);
    const roots = rootTiles(geometry);
    const tiles: Tile[] = [];
    for (const bbox of roots) {
      tiles.push(await this.prisma.tile.create({ data: { campaignId: campaign.id, bbox: bbox as unknown as Prisma.InputJsonValue, depth: 0 } }));
    }
    this.log.log({ campaignId: campaign.id, roots: tiles.length }, 'root tiles created');
    return tiles;
  }

  /** Mark saturated and create the 4 quadrant children (skipping quadrants outside the geometry). Returns the children. */
  async saturate(tile: Tile, campaign: Campaign, resultCount: number): Promise<Tile[]> {
    const geometry = CampaignGeometrySchema.parse(campaign.geometry);
    const bbox = tile.bbox as unknown as BBox;
    const children = splitBBox(bbox).filter((q) => tileTouchesGeometry(q, geometry));
    return this.prisma.$transaction(async (tx) => {
      await tx.tile.update({ where: { id: tile.id }, data: { status: 'saturated', resultCount } });
      const created: Tile[] = [];
      for (const q of children) {
        created.push(await tx.tile.create({ data: { campaignId: tile.campaignId, parentId: tile.id, bbox: q as unknown as Prisma.InputJsonValue, depth: tile.depth + 1 } }));
      }
      return created;
    });
  }

  /** Can this tile be subdivided further? Below ~100 m radius or MAX_DEPTH we stop and accept incompleteness. */
  canSubdivide(tile: Tile): { ok: boolean; reason?: string } {
    if (tile.depth >= MAX_DEPTH) return { ok: false, reason: `max depth ${MAX_DEPTH}` };
    const r = bboxCircumradiusM(tile.bbox as unknown as BBox);
    if (r / 2 < MIN_RADIUS_M) return { ok: false, reason: `child radius would be below ${MIN_RADIUS_M} m` };
    return { ok: true };
  }

  async enqueue(tileIds: string[]): Promise<number> {
    if (!tileIds.length) return 0;
    const q = this.queues.get('discoveryTile');
    await q.addBulk(tileIds.map((id) => ({ name: QUEUES.discoveryTile.name, data: { tileId: id }, opts: { jobId: `tile-${id}` } })));
    return tileIds.length;
  }

  async enqueuePending(campaignId: string): Promise<number> {
    const pending = await this.prisma.tile.findMany({ where: { campaignId, status: { in: ['pending', 'searching'] } }, select: { id: true } });
    return this.enqueue(pending.map((t) => t.id));
  }

  async listForMap(campaignId: string) {
    const tiles = await this.prisma.tile.findMany({ where: { campaignId }, orderBy: [{ depth: 'asc' }, { createdAt: 'asc' }] });
    return tiles.map((t) => ({ id: t.id, parentId: t.parentId, bbox: t.bbox as unknown as BBox, depth: t.depth, status: t.status, resultCount: t.resultCount, liveSiteCount: t.liveSiteCount }));
  }

  async isCampaignFinished(campaignId: string): Promise<boolean> {
    const open = await this.prisma.tile.count({ where: { campaignId, status: { in: ['pending', 'searching'] } } });
    return open === 0;
  }
}
