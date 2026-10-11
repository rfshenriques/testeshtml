import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from './audit.service';

export const RETENTION = {
  unengagedDays: 90,
  objectionDays: 30,
  auditMonths: 24,
  snapshotDays: 30,
} as const;

/** Retention jobs (spec §0.2, §1.4). Run nightly from the maintenance.purge worker. */
@Injectable()
export class RetentionService {
  private readonly log = new Logger(RetentionService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Google content: purge expired snapshots. Never touches PlaceRef. */
  async purgeExpiredSnapshots(now = new Date()): Promise<number> {
    const r = await this.prisma.placeSnapshot.deleteMany({ where: { expiresAt: { lte: now } } });
    if (r.count) this.log.log({ count: r.count }, 'purged expired place snapshots');
    return r.count;
  }

  /** Unengaged leads: purge contact data 90 days after last touch (keeps the lead row + score for stats). */
  async purgeUnengagedContacts(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION.unengagedDays * 86400_000);
    const leads = await this.prisma.lead.findMany({
      where: {
        contactDataPurgedAt: null,
        stage: { notIn: ['won', 'replied'] },
        replies: { none: {} },
        OR: [{ lastTouchAt: { lte: cutoff } }, { lastTouchAt: null, createdAt: { lte: cutoff } }],
      },
      select: { id: true },
    });
    for (const l of leads) {
      await this.prisma.$transaction(async (tx) => {
        await tx.contact.deleteMany({ where: { leadId: l.id } });
        await tx.outreachMessage.deleteMany({ where: { leadId: l.id, status: { in: ['queued', 'cancelled', 'failed'] } } });
        await tx.lead.update({ where: { id: l.id }, data: { phone: null, contactDataPurgedAt: now } });
        await this.audit.log('retention.contacts_purged', { policy: 'unengaged_90d' }, { leadId: l.id, tx });
      });
    }
    if (leads.length) this.log.log({ count: leads.length }, 'purged contact data of unengaged leads');
    return leads.length;
  }

  /** Objections: purge within 30 days, retaining only the suppression hash + a minimal objection record (the audit row). */
  async purgeObjections(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION.objectionDays * 86400_000);
    const leads = await this.prisma.lead.findMany({
      where: { stage: 'suppressed', contactDataPurgedAt: null, updatedAt: { lte: cutoff } },
      select: { id: true, businessName: true, countryCode: true, legalGateReason: true },
    });
    for (const l of leads) {
      await this.prisma.$transaction(async (tx) => {
        await tx.contact.deleteMany({ where: { leadId: l.id } });
        await tx.reply.deleteMany({ where: { leadId: l.id } });
        await tx.outreachMessage.deleteMany({ where: { leadId: l.id } });
        await tx.generatedSite.deleteMany({ where: { leadId: l.id } });
        await tx.lead.update({
          where: { id: l.id },
          data: { phone: null, notes: null, classification: undefined, websiteProbe: undefined, contactDataPurgedAt: now, businessName: '[purged]' },
        });
        await this.audit.log('retention.objection_purged', { reason: l.legalGateReason, countryCode: l.countryCode }, { leadId: l.id, tx });
      });
    }
    if (leads.length) this.log.log({ count: leads.length }, 'purged objection records');
    return leads.length;
  }

  /** Audit log: retained 24 months. */
  async purgeOldAudit(now = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - RETENTION.auditMonths);
    const r = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lte: cutoff } } });
    return r.count;
  }

  async runAll(now = new Date()) {
    const result = {
      snapshots: await this.purgeExpiredSnapshots(now),
      unengaged: await this.purgeUnengagedContacts(now),
      objections: await this.purgeObjections(now),
      audit: await this.purgeOldAudit(now),
      ranAt: now.toISOString(),
    };
    await this.audit.log('retention.run', result);
    return result;
  }

  async status() {
    const last = await this.prisma.auditLog.findFirst({ where: { action: 'retention.run' }, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    const [expiredSnapshots, snapshotsTotal, suppressions] = await Promise.all([
      this.prisma.placeSnapshot.count({ where: { expiresAt: { lte: now } } }),
      this.prisma.placeSnapshot.count(),
      this.prisma.suppression.count(),
    ]);
    return { lastRun: last?.createdAt ?? null, lastResult: last?.detail ?? null, expiredSnapshotsPending: expiredSnapshots, snapshotsTotal, suppressions, policy: RETENTION };
  }
}
