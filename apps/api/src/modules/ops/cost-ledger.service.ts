import { Injectable } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';

export type CostCategory =
  | 'places_search'
  | 'places_details'
  | 'llm'
  | 'email_verify'
  | 'enrichment'
  | 'email_send'
  | 'storage'
  | 'images';

export interface CostInput {
  category: CostCategory;
  units: number;
  usd: number;
  campaignId?: string | null;
  leadId?: string | null;
  provider?: string | null;
  meta?: Record<string, unknown>;
}

/** Every billable external call writes a CostEvent (spec §14). */
@Injectable()
export class CostLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CostInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.costEvent.create({
        data: {
          category: input.category,
          units: input.units,
          usd: new Prisma.Decimal(input.usd),
          campaignId: input.campaignId ?? null,
          leadId: input.leadId ?? null,
          provider: input.provider ?? null,
          meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      if (input.campaignId && input.usd > 0) {
        await tx.campaign.update({
          where: { id: input.campaignId },
          data: { spendUsd: { increment: new Prisma.Decimal(input.usd) } },
        });
      }
    });
  }

  async totalsByCategory(campaignId?: string, since?: Date) {
    const rows = await this.prisma.costEvent.groupBy({
      by: ['category'],
      where: { ...(campaignId ? { campaignId } : {}), ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { usd: true, units: true },
    });
    return rows.map((r) => ({ category: r.category, usd: Number(r._sum.usd ?? 0), units: r._sum.units ?? 0 }));
  }

  async totalsByCampaign(since?: Date) {
    const rows = await this.prisma.costEvent.groupBy({
      by: ['campaignId'],
      where: since ? { createdAt: { gte: since } } : undefined,
      _sum: { usd: true },
    });
    return rows.map((r) => ({ campaignId: r.campaignId, usd: Number(r._sum.usd ?? 0) }));
  }

  async spendSince(category: CostCategory, since: Date): Promise<number> {
    const agg = await this.prisma.costEvent.aggregate({ where: { category, createdAt: { gte: since } }, _sum: { usd: true } });
    return Number(agg._sum.usd ?? 0);
  }

  /** The four numbers that determine whether the business works (spec §14). */
  async unitEconomics(campaignId?: string) {
    const where = campaignId ? { campaignId } : {};
    const [totalUsd, leads, contacted, replied, won] = await Promise.all([
      this.prisma.costEvent.aggregate({ where, _sum: { usd: true } }).then((a) => Number(a._sum.usd ?? 0)),
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, messages: { some: { status: { in: ['sent', 'delivered', 'opened', 'clicked', 'replied'] } } } } }),
      this.prisma.lead.count({ where: { ...where, replies: { some: {} } } }),
      this.prisma.lead.count({ where: { ...where, stage: 'won' } }),
    ]);
    const per = (n: number) => (n > 0 ? totalUsd / n : null);
    return { totalUsd, leads, contacted, replied, won, costPerLead: per(leads), costPerContacted: per(contacted), costPerReply: per(replied), costPerWon: per(won) };
  }
}
