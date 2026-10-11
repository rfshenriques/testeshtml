import { Injectable } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** Append-only audit log of every send, consent-relevant decision and suppression event (spec §1.4). Retained 24 months. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(action: string, detail: Record<string, unknown>, opts: { actor?: string; leadId?: string | null; subjectId?: string | null; tx?: Prisma.TransactionClient } = {}) {
    const db = opts.tx ?? this.prisma;
    return db.auditLog.create({
      data: { action, actor: opts.actor ?? 'system', leadId: opts.leadId ?? null, subjectId: opts.subjectId ?? null, detail: detail as Prisma.InputJsonValue },
    });
  }

  query(filter: { action?: string; leadId?: string; since?: Date; until?: Date; take?: number; skip?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(filter.action ? { action: { startsWith: filter.action } } : {}),
        ...(filter.leadId ? { leadId: filter.leadId } : {}),
        ...(filter.since || filter.until ? { createdAt: { gte: filter.since, lte: filter.until } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.take ?? 100, 500),
      skip: filter.skip ?? 0,
    });
  }
}
