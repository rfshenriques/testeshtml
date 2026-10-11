import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from './audit.service';
import { hashEmail, normaliseDomain, normaliseEmail, PUBLIC_EMAIL_DOMAINS } from './suppression.util';
import { LeadEventsService } from '../crm/lead-events.service';

export type SuppressionReason =
  | 'unsubscribe'
  | 'hard_bounce'
  | 'spam_complaint'
  | 'hostile_reply'
  | 'takedown_request'
  | 'objection'
  | 'operator'
  | 'sequence_complete'
  | 'not_interested';

export interface SuppressInput {
  email?: string | null;
  placeId?: string | null;
  domain?: string | null;
  reason: SuppressionReason;
  note?: string;
  actor?: string;
  /** Lead to move to the terminal `suppressed` stage (and whose other contacts/place are suppressed too). */
  leadId?: string | null;
  /** Also suppress the lead's placeId and the registrable domain of its email(s). Default true for user-initiated reasons. */
  cascade?: boolean;
}

/**
 * Global suppression table (spec §1.3): append-only, keyed by SHA-256 of the lowercased email,
 * plus separate keys on place_id and normalised domain. Writes are synchronous: `add` resolves
 * only once the rows are committed, so a caller can return 200 to an unsubscribe with the
 * guarantee that no further send can pass `isSuppressed`.
 */
@Injectable()
export class SuppressionService {
  private readonly log = new Logger(SuppressionService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly leadEvents: LeadEventsService) {}

  async isSuppressed(keys: { email?: string | null; placeId?: string | null; domain?: string | null }): Promise<{ suppressed: boolean; matches: string[] }> {
    const or: Prisma.SuppressionWhereInput[] = [];
    if (keys.email) or.push({ emailHash: hashEmail(keys.email) });
    if (keys.placeId) or.push({ placeId: keys.placeId });
    const domain = normaliseDomain(keys.domain ?? keys.email ?? null);
    if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) or.push({ domain });
    if (!or.length) return { suppressed: false, matches: [] };
    const rows = await this.prisma.suppression.findMany({ where: { OR: or }, select: { emailHash: true, placeId: true, domain: true, reason: true } });
    return { suppressed: rows.length > 0, matches: rows.map((r) => `${r.emailHash ? 'email' : r.placeId ? 'place' : 'domain'}:${r.reason}`) };
  }

  /** Suppress everything about a lead: all its contacts, its place id and its email domains. Synchronous. */
  async suppressLead(leadId: string, reason: SuppressionReason, opts: { note?: string; actor?: string } = {}) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contacts: true } });
    await this.prisma.$transaction(async (tx) => {
      await this.upsertKeys(tx, { placeId: lead.placeId, reason, note: opts.note, actor: opts.actor, leadId });
      for (const c of lead.contacts) {
        await this.upsertKeys(tx, { email: c.email, reason, note: opts.note, actor: opts.actor, leadId });
      }
      await this.leadEvents.suppress(leadId, reason, tx);
      await tx.outreachMessage.updateMany({ where: { leadId, status: 'queued' }, data: { status: 'cancelled', error: `suppressed: ${reason}` } });
    });
    this.log.log({ leadId, reason }, 'lead suppressed');
  }

  /** Add suppression keys (email / place / domain). Synchronous; resolves after commit. */
  async add(input: SuppressInput) {
    await this.prisma.$transaction(async (tx) => {
      await this.upsertKeys(tx, input);
      if (input.leadId) {
        await this.leadEvents.suppress(input.leadId, input.reason, tx);
        await tx.outreachMessage.updateMany({ where: { leadId: input.leadId, status: 'queued' }, data: { status: 'cancelled', error: `suppressed: ${input.reason}` } });
      }
    });
  }

  private async upsertKeys(tx: Prisma.TransactionClient, input: SuppressInput) {
    const actor = input.actor ?? 'system';
    const base = { reason: input.reason, note: input.note ?? null };
    if (input.email) {
      const emailHash = hashEmail(input.email);
      await tx.suppression.upsert({ where: { emailHash }, create: { emailHash, ...base }, update: {} });
      await this.audit.log('suppression.added', { key: 'email', emailHash, reason: input.reason, note: input.note }, { actor, leadId: input.leadId, tx });
      const cascade = input.cascade ?? true;
      const domain = normaliseDomain(normaliseEmail(input.email));
      if (cascade && domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
        const exists = await tx.suppression.findFirst({ where: { domain, emailHash: null, placeId: null } });
        if (!exists) {
          await tx.suppression.create({ data: { domain, ...base } });
          await this.audit.log('suppression.added', { key: 'domain', domain, reason: input.reason }, { actor, leadId: input.leadId, tx });
        }
      }
    }
    if (input.placeId) {
      await tx.suppression.upsert({ where: { placeId: input.placeId }, create: { placeId: input.placeId, ...base }, update: {} });
      await this.audit.log('suppression.added', { key: 'place', placeId: input.placeId, reason: input.reason, note: input.note }, { actor, leadId: input.leadId, tx });
    }
    if (input.domain) {
      const domain = normaliseDomain(input.domain);
      if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
        const exists = await tx.suppression.findFirst({ where: { domain, emailHash: null, placeId: null } });
        if (!exists) {
          await tx.suppression.create({ data: { domain, ...base } });
          await this.audit.log('suppression.added', { key: 'domain', domain, reason: input.reason, note: input.note }, { actor, leadId: input.leadId, tx });
        }
      }
    }
  }

  /** View/search only. There is deliberately no delete method anywhere in the codebase (spec §1.3). */
  search(q: { email?: string; placeId?: string; domain?: string; reason?: string; take?: number; skip?: number }) {
    const where: Prisma.SuppressionWhereInput = {};
    if (q.email) where.emailHash = hashEmail(q.email);
    if (q.placeId) where.placeId = q.placeId;
    if (q.domain) where.domain = normaliseDomain(q.domain) ?? q.domain;
    if (q.reason) where.reason = q.reason;
    return this.prisma.suppression.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(q.take ?? 100, 500), skip: q.skip ?? 0 });
  }

  count() {
    return this.prisma.suppression.count();
  }
}
