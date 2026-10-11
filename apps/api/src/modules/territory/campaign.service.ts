import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CampaignGeometrySchema, PLACE_TYPE_TIERS } from '@sitewright/shared-types';
import { Prisma, CampaignStatus } from '@sitewright/db';
import { z } from 'zod';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { DomainError } from '../../shared/errors/errors';
import { AlertService } from '../ops/alert.service';
import { AuditService } from '../compliance/audit.service';
import { TilerService } from './tiler.service';
import { estimateCampaignCost } from './geometry';
import { CostLedgerService } from '../ops/cost-ledger.service';

export const CampaignInputSchema = z.object({
  name: z.string().min(1).max(120),
  countryCode: z.string().length(2).transform((s) => s.toUpperCase()),
  geometry: CampaignGeometrySchema,
  includedTypes: z.array(z.string().min(1)).min(1).max(40),
  excludedTypes: z.array(z.string()).default([]),
  budgetUsdCap: z.number().positive().max(100_000),
  maxLeads: z.number().int().positive().optional().nullable(),
  languageCode: z.string().min(2).max(12).optional().nullable(),
  includeHttpOnly: z.boolean().default(false),
});
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

/** Campaign lifecycle + budget ceiling enforcement (spec §5.1, §5.2). */
@Injectable()
export class CampaignService {
  private readonly log = new Logger(CampaignService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiler: TilerService,
    private readonly alerts: AlertService,
    private readonly audit: AuditService,
    private readonly costs: CostLedgerService,
  ) {}

  async create(raw: unknown, actor = 'operator') {
    const input = CampaignInputSchema.parse(raw);
    const campaign = await this.prisma.campaign.create({
      data: { ...input, geometry: input.geometry as Prisma.InputJsonValue, budgetUsdCap: new Prisma.Decimal(input.budgetUsdCap) },
    });
    await this.audit.log('campaign.created', { input }, { actor, subjectId: campaign.id });
    return campaign;
  }

  async update(id: string, raw: unknown, actor = 'operator') {
    const existing = await this.get(id);
    if (existing.status !== 'draft') throw new DomainError('only draft campaigns can be edited', 'INVALID_STATE');
    const input = CampaignInputSchema.partial().parse(raw);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { ...input, geometry: input.geometry as Prisma.InputJsonValue | undefined, budgetUsdCap: input.budgetUsdCap !== undefined ? new Prisma.Decimal(input.budgetUsdCap) : undefined },
    });
    await this.audit.log('campaign.updated', { input }, { actor, subjectId: id });
    return campaign;
  }

  async get(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`campaign ${id} not found`);
    return c;
  }

  async list() {
    const campaigns = await this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    const [leadCounts, tileCounts] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['campaignId'], _count: { _all: true } }),
      this.prisma.tile.groupBy({ by: ['campaignId', 'status'], _count: { _all: true } }),
    ]);
    return campaigns.map((c) => ({
      ...c,
      budgetUsdCap: Number(c.budgetUsdCap),
      spendUsd: Number(c.spendUsd),
      leads: leadCounts.find((l) => l.campaignId === c.id)?._count._all ?? 0,
      tiles: this.tileSummary(tileCounts.filter((t) => t.campaignId === c.id).map((t) => ({ status: t.status, count: t._count._all }))),
    }));
  }

  async detail(id: string) {
    const campaign = await this.get(id);
    const [tiles, stages, byCategory, economics] = await Promise.all([
      this.prisma.tile.groupBy({ by: ['status'], where: { campaignId: id }, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['stage'], where: { campaignId: id }, _count: { _all: true } }),
      this.costs.totalsByCategory(id),
      this.costs.unitEconomics(id),
    ]);
    const geometry = CampaignGeometrySchema.parse(campaign.geometry);
    return {
      campaign: { ...campaign, budgetUsdCap: Number(campaign.budgetUsdCap), spendUsd: Number(campaign.spendUsd) },
      tiles: this.tileSummary(tiles.map((t) => ({ status: t.status, count: t._count._all }))),
      leadsByStage: stages.map((s) => ({ stage: s.stage, count: s._count._all })),
      costs: { byCategory, economics },
      estimate: estimateCampaignCost(geometry, campaign.includedTypes.length),
    };
  }

  private tileSummary(rows: { status: string; count: number }[]) {
    const s = { total: 0, pending: 0, searching: 0, saturated: 0, done: 0, failed: 0 } as Record<string, number>;
    for (const r of rows) {
      s[r.status] = (s[r.status] ?? 0) + r.count;
      s.total += r.count;
    }
    return s;
  }

  /** draft|paused → running. Creates root tiles on first start and enqueues all pending tiles. */
  async start(id: string, actor = 'operator') {
    const campaign = await this.get(id);
    if (!['draft', 'paused'].includes(campaign.status)) throw new DomainError(`cannot start a ${campaign.status} campaign`, 'INVALID_STATE');
    if (Number(campaign.spendUsd) >= Number(campaign.budgetUsdCap)) throw new DomainError('budget cap already reached; raise the cap first', 'BUDGET_EXCEEDED');
    const tileCount = await this.prisma.tile.count({ where: { campaignId: id } });
    if (tileCount === 0) await this.tiler.createRootTiles(campaign);
    await this.prisma.campaign.update({ where: { id }, data: { status: 'running' } });
    const enqueued = await this.tiler.enqueuePending(id);
    await this.audit.log('campaign.started', { enqueued }, { actor, subjectId: id });
    return { status: 'running' as CampaignStatus, enqueued };
  }

  async pause(id: string, actor = 'operator', reason = 'operator') {
    await this.setStatus(id, 'paused', actor, reason, ['running']);
  }

  async resume(id: string, actor = 'operator') {
    return this.start(id, actor);
  }

  /** Terminal. */
  async halt(id: string, actor = 'operator', reason = 'operator') {
    await this.setStatus(id, 'halted', actor, reason, ['draft', 'running', 'paused']);
  }

  async complete(id: string) {
    await this.setStatus(id, 'complete', 'system', 'all tiles done', ['running']);
  }

  private async setStatus(id: string, status: CampaignStatus, actor: string, reason: string, from: CampaignStatus[]) {
    const c = await this.get(id);
    if (!from.includes(c.status)) throw new DomainError(`cannot move campaign from ${c.status} to ${status}`, 'INVALID_STATE');
    await this.prisma.campaign.update({ where: { id }, data: { status } });
    await this.audit.log(`campaign.${status}`, { reason }, { actor, subjectId: id });
    this.log.log({ campaignId: id, status, reason }, 'campaign status changed');
  }

  /** Called after every billable request (spec §5.2): warn at 90%, pause at 100% and notify. */
  async checkBudget(id: string): Promise<'ok' | 'warned' | 'paused'> {
    const c = await this.get(id);
    const spend = Number(c.spendUsd);
    const cap = Number(c.budgetUsdCap);
    if (spend >= cap) {
      if (c.status === 'running') {
        await this.prisma.campaign.update({ where: { id }, data: { status: 'paused' } });
        await this.alerts.raise('budget_exhausted', 'critical', `Campaign "${c.name}" reached its budget cap ($${cap.toFixed(2)}) and was paused`, { campaignId: id, spend, cap });
        await this.audit.log('campaign.paused', { reason: 'budget cap reached', spend, cap }, { subjectId: id });
      }
      return 'paused';
    }
    if (spend >= cap * 0.9) {
      const recent = await this.prisma.alert.findFirst({ where: { kind: 'budget_warning', meta: { path: ['campaignId'], equals: id }, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      if (!recent) await this.alerts.raise('budget_warning', 'warning', `Campaign "${c.name}" has spent ${((spend / cap) * 100).toFixed(0)}% of its budget`, { campaignId: id, spend, cap });
      return 'warned';
    }
    return 'ok';
  }

  /** Is the campaign allowed to do more paid work right now? Discovery may be complete while downstream stages still run. */
  async canSpend(id: string): Promise<boolean> {
    const c = await this.get(id);
    return (c.status === 'running' || c.status === 'complete') && Number(c.spendUsd) < Number(c.budgetUsdCap);
  }

  placeTypeTiers() {
    return { tiers: PLACE_TYPE_TIERS };
  }
}
