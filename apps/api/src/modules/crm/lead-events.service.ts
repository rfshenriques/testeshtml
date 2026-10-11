import { Injectable, Logger } from '@nestjs/common';
import { LeadStage, Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Lead timeline + pipeline state transitions (spec §4). A lead's stage advances only on success;
 * `suppressed` is terminal. Every transition is recorded as a LeadEvent.
 */
@Injectable()
export class LeadEventsService {
  private readonly log = new Logger(LeadEventsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async emit(leadId: string, type: string, payload: Record<string, unknown> = {}, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    await db.leadEvent.create({ data: { leadId, type, payload: payload as Prisma.InputJsonValue } });
  }

  /** Advance the stage forward only (never backwards, never out of suppressed). */
  async advance(leadId: string, to: LeadStage, payload: Record<string, unknown> = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
    if (lead.stage === 'suppressed') return lead.stage;
    const toOrder = STAGE_ORDER[to];
    const fromOrder = STAGE_ORDER[lead.stage];
    if (toOrder !== undefined && fromOrder !== undefined && toOrder <= fromOrder) return lead.stage;
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { stage: to, previousStage: lead.stage, lastTouchAt: new Date() } });
      await this.emit(leadId, 'stage.advanced', { from: lead.stage, to, ...payload }, tx);
    });
    return to;
  }

  /** Move a lead out of the main pipeline into manual review (or back to its previous stage on approval). */
  async setStage(leadId: string, to: LeadStage, payload: Record<string, unknown> = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
    if (lead.stage === 'suppressed') return lead.stage;
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { stage: to, previousStage: lead.stage } });
      await this.emit(leadId, 'stage.set', { from: lead.stage, to, ...payload }, tx);
    });
    return to;
  }

  /** Terminal. */
  async suppress(leadId: string, reason: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const lead = await db.lead.update({
      where: { id: leadId },
      data: { stage: 'suppressed', legalGate: 'blocked', legalGateReason: `suppressed: ${reason}` },
      select: { id: true, previousStage: true },
    });
    await this.emit(leadId, 'lead.suppressed', { reason }, tx);
    this.log.log({ leadId, reason }, 'lead suppressed');
    return lead;
  }
}

/** Linear pipeline order (spec §4). manual_review and suppressed are side states. */
export const STAGE_ORDER: Partial<Record<LeadStage, number>> = {
  discovered: 0, qualified: 1, enriched: 2, profiled: 3, generated: 4, quoted: 5, contacted: 6, replied: 7, won: 8, lost: 8,
};
