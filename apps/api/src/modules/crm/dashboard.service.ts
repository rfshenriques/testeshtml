import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CostLedgerService } from '../ops/cost-ledger.service';
import { AlertService } from '../ops/alert.service';
import { MailboxService } from '../outreach/mailbox.service';
import { ENV, Env } from '../../shared/config/config.module';
import { Inject } from '@nestjs/common';

/** Dashboard (spec §13.1 item 1). */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly costs: CostLedgerService, private readonly alerts: AlertService, private readonly mailboxes: MailboxService, @Inject(ENV) private readonly env: Env) {}

  async overview() {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [campaigns, leadCounts, funnel, sentToday, boxes, replyQueue, reviewQueue, approvalQueue, alerts, economics, viewsToday] = await Promise.all([
      this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, status: true, countryCode: true, spendUsd: true, budgetUsdCap: true } }),
      this.prisma.lead.groupBy({ by: ['campaignId'], _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
      this.prisma.outreachMessage.count({ where: { sentAt: { gte: today }, kind: { in: ['sequence', 'bridge'] } } }),
      this.mailboxes.list(),
      this.prisma.reply.count({ where: { handled: false } }),
      this.prisma.reviewItem.count({ where: { status: 'open' } }),
      this.prisma.outreachMessage.count({ where: { status: 'queued', requiresApproval: true, approvedAt: null } }),
      this.alerts.list(true, 20),
      this.costs.unitEconomics(),
      this.prisma.previewView.count({ where: { viewedAt: { gte: today } } }),
    ]);
    const cap = boxes.filter((b) => ['active', 'warming'].includes(b.status)).reduce((s, b) => s + b.effectiveCap, 0);
    return {
      campaigns: {
        running: campaigns.filter((c) => c.status === 'running').length, total: campaigns.length,
        list: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, countryCode: c.countryCode, spendUsd: Number(c.spendUsd), budgetUsdCap: Number(c.budgetUsdCap), leads: leadCounts.find((l) => l.campaignId === c.id)?._count._all ?? 0 })),
      },
      funnel: funnel.map((f) => ({ stage: f.stage, count: f._count._all })),
      sends: { today: sentToday, cap: Math.min(cap, this.env.MAX_SENDS_PER_DAY_GLOBAL), perMailbox: boxes.map((b) => ({ id: b.id, address: b.address, status: b.status, sentToday: b.usedToday, dailyCap: b.effectiveCap, warmupStage: b.warmup.week - 1 })) },
      replyQueue, reviewQueue, approvalQueue, alerts, economics, viewsToday,
    };
  }
}
