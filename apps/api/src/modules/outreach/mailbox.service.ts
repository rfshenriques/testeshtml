import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Mailbox, Prisma } from '@sitewright/db';
import { MAILBOX_DAILY_CEILING, WARMUP_REAL_SHARE, WARMUP_SCHEDULE } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';
import { AlertService } from '../ops/alert.service';
import { AuditService } from '../compliance/audit.service';
import { QuotaService } from '../ops/quota.service';
import { QuotaExceededError } from '../../shared/errors/errors';

export interface Reputation { sent7d: number; sent30d: number; bounceRate7d: number; bounceRate30d: number; complaintRate7d: number; complaintRate30d: number; replyRate: number; sentTotal: number; replies: number }

/**
 * Sending domains + mailboxes (spec §11.1–11.3): warmup schedule per mailbox, hard 50/day ceiling,
 * atomic per-mailbox and global daily counters in Redis, reputation guardrails that pause mailboxes
 * and burn domains automatically.
 */
@Injectable()
export class MailboxService {
  private readonly log = new Logger(MailboxService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly alerts: AlertService,
    private readonly audit: AuditService,
    private readonly quotas: QuotaService,
  ) {}

  /** Week index (0-based) since warmup started → daily cap, never above the ceiling. */
  static warmupCap(warmupStartedAt: Date, now = new Date()): { week: number; cap: number; realShare: number } {
    const week = Math.max(0, Math.floor((now.getTime() - warmupStartedAt.getTime()) / (7 * 86400_000)));
    const idx = Math.min(week, WARMUP_SCHEDULE.length - 1);
    return { week: week + 1, cap: Math.min(WARMUP_SCHEDULE[idx], MAILBOX_DAILY_CEILING), realShare: WARMUP_REAL_SHARE[idx] };
  }

  async addDomain(domain: string, actor: string) {
    const d = domain.trim().toLowerCase();
    const row = await this.prisma.sendingDomain.upsert({ where: { domain: d }, create: { domain: d }, update: {} });
    await this.audit.log('domain.added', { domain: d }, { actor, subjectId: row.id });
    return row;
  }

  async addMailbox(address: string, sendingDomain: string, actor: string) {
    const addr = address.trim().toLowerCase();
    const domain = await this.prisma.sendingDomain.findUnique({ where: { domain: sendingDomain.trim().toLowerCase() }, include: { mailboxes: true } });
    if (!domain) throw new Error('add the sending domain first');
    if (domain.mailboxes.length >= 3) throw new Error('at most 3 mailboxes per domain (spec §11.1)');
    if (!addr.endsWith(`@${domain.domain}`)) throw new Error('mailbox address must be on the sending domain');
    const mb = await this.prisma.mailbox.create({ data: { address: addr, sendingDomainId: domain.id, sendingDomain: domain.domain, dailyCap: WARMUP_SCHEDULE[0], status: 'warming' } });
    await this.audit.log('mailbox.added', { address: addr }, { actor, subjectId: mb.id });
    return mb;
  }

  async pause(id: string, reason: string, actor = 'system') {
    const mb = await this.prisma.mailbox.update({ where: { id }, data: { status: 'paused', pauseReason: reason } });
    await this.audit.log('mailbox.paused', { reason }, { actor, subjectId: id });
    return mb;
  }

  async resume(id: string, actor = 'operator') {
    const mb = await this.prisma.mailbox.findUniqueOrThrow({ where: { id }, include: { domainRef: true } });
    if (mb.domainRef.status === 'burned') throw new Error('domain is burned; mailboxes on it cannot be resumed');
    const { week } = MailboxService.warmupCap(mb.warmupStartedAt);
    const updated = await this.prisma.mailbox.update({ where: { id }, data: { status: week > WARMUP_SCHEDULE.length ? 'active' : 'warming', pauseReason: null } });
    await this.audit.log('mailbox.resumed', {}, { actor, subjectId: id });
    return updated;
  }

  async burnDomain(domainId: string, reason: string) {
    await this.prisma.$transaction([
      this.prisma.sendingDomain.update({ where: { id: domainId }, data: { status: 'burned' } }),
      this.prisma.mailbox.updateMany({ where: { sendingDomainId: domainId }, data: { status: 'burned', pauseReason: reason } }),
    ]);
    await this.audit.log('domain.burned', { reason }, { subjectId: domainId });
    await this.alerts.raise('domain_burned', 'critical', `Sending domain burned: ${reason}`, { domainId });
  }

  /** Effective cap today for a mailbox: warmup schedule ∧ operator cap ∧ 50 ceiling. */
  effectiveCap(mb: Mailbox, now = new Date()): number {
    const { cap } = MailboxService.warmupCap(mb.warmupStartedAt, now);
    return Math.min(cap, mb.dailyCap, MAILBOX_DAILY_CEILING);
  }

  /** Atomically reserve one send for today on this mailbox (and globally). Throws when any ceiling is reached. Returns a release fn. */
  async reserveSend(mb: Mailbox, now = new Date()): Promise<() => Promise<void>> {
    const day = now.toISOString().slice(0, 10);
    const cap = this.effectiveCap(mb, now);
    const { realShare } = MailboxService.warmupCap(mb.warmupStartedAt, now);
    const realCap = Math.floor(cap * realShare);
    const key = `mailbox:${mb.id}:${day}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 60 * 60 * 36);
    if (n > realCap) {
      await this.redis.decr(key);
      throw new QuotaExceededError(`mailbox ${mb.address} daily cap reached (${realCap} real sends; warmup cap ${cap})`, { mailboxId: mb.id, cap, realCap, used: n - 1 });
    }
    try {
      await this.quotas.consume('email_sends_global', this.env.MAX_SENDS_PER_DAY_GLOBAL, 1);
    } catch (e) {
      await this.redis.decr(key);
      throw e;
    }
    return async () => {
      await this.redis.decr(key);
      await this.redis.decrby(`quota:email_sends_global:${day}`, 1);
    };
  }

  async usedToday(mb: Mailbox, now = new Date()): Promise<number> {
    return Number((await this.redis.get(`mailbox:${mb.id}:${now.toISOString().slice(0, 10)}`)) ?? 0);
  }

  /** Pick the active mailbox with the most headroom today. */
  async pickMailbox(now = new Date()): Promise<Mailbox | null> {
    const boxes = await this.prisma.mailbox.findMany({ where: { status: { in: ['active', 'warming'] } }, include: { domainRef: true } });
    let best: { mb: Mailbox; headroom: number } | null = null;
    for (const mb of boxes) {
      if (mb.domainRef.status === 'burned' || mb.domainRef.status === 'paused') continue;
      const { cap, realShare } = MailboxService.warmupCap(mb.warmupStartedAt, now);
      const realCap = Math.floor(Math.min(cap, mb.dailyCap) * realShare);
      const headroom = realCap - (await this.usedToday(mb, now));
      if (headroom > 0 && (!best || headroom > best.headroom)) best = { mb, headroom };
    }
    return best?.mb ?? null;
  }

  async reputation(mailboxId: string, now = new Date()): Promise<Reputation> {
    const since7 = new Date(now.getTime() - 7 * 86400_000);
    const since30 = new Date(now.getTime() - 30 * 86400_000);
    const sentStatuses = ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained'] as const;
    const count = (where: Prisma.OutreachMessageWhereInput) => this.prisma.outreachMessage.count({ where: { mailboxId, kind: { in: ['sequence', 'bridge'] }, ...where } });
    const [sent7d, sent30d, b7, b30, c7, c30, sentTotal, replies] = await Promise.all([
      count({ sentAt: { gte: since7 }, status: { in: [...sentStatuses] } }), count({ sentAt: { gte: since30 }, status: { in: [...sentStatuses] } }),
      count({ sentAt: { gte: since7 }, status: 'bounced' }), count({ sentAt: { gte: since30 }, status: 'bounced' }),
      count({ sentAt: { gte: since7 }, status: 'complained' }), count({ sentAt: { gte: since30 }, status: 'complained' }),
      count({ status: { in: [...sentStatuses] } }),
      this.prisma.reply.count({ where: { message: { mailboxId }, intent: { notIn: ['out_of_office'] } } }),
    ]);
    const rate = (n: number, d: number) => (d ? n / d : 0);
    return { sent7d, sent30d, bounceRate7d: rate(b7, sent7d), bounceRate30d: rate(b30, sent30d), complaintRate7d: rate(c7, sent7d), complaintRate30d: rate(c30, sent30d), replyRate: rate(replies, sentTotal), sentTotal, replies };
  }

  /** Guardrails (spec §11.3). Called after every send/bounce/complaint/reply event. */
  async enforceGuardrails(mailboxId: string): Promise<string[]> {
    const mb = await this.prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId }, include: { domainRef: { include: { mailboxes: true } } } });
    const rep = await this.reputation(mailboxId);
    const actions: string[] = [];
    const minSample = 20;
    if (rep.sent7d >= minSample && rep.bounceRate7d > 0.03 || rep.sent30d >= minSample && rep.bounceRate30d > 0.03) {
      if (mb.status !== 'paused') { await this.pause(mailboxId, `hard bounce rate ${(Math.max(rep.bounceRate7d, rep.bounceRate30d) * 100).toFixed(1)}% > 3%`); actions.push('paused:bounce'); await this.alerts.raise('mailbox_paused', 'critical', `Mailbox ${mb.address} paused: bounce rate above 3%`, { mailboxId, rep }); }
    }
    if (rep.sent7d >= minSample && rep.complaintRate7d > 0.001 || rep.sent30d >= minSample && rep.complaintRate30d > 0.001) {
      if (mb.status !== 'paused') { await this.pause(mailboxId, `complaint rate ${(Math.max(rep.complaintRate7d, rep.complaintRate30d) * 100).toFixed(2)}% > 0.1%`); actions.push('paused:complaint'); await this.alerts.raise('mailbox_paused', 'critical', `Mailbox ${mb.address} paused: complaint rate above 0.1%`, { mailboxId, rep }); }
    }
    if (rep.sentTotal >= 200 && rep.replyRate < 0.01 && mb.status !== 'paused') {
      await this.pause(mailboxId, `reply rate ${(rep.replyRate * 100).toFixed(2)}% < 1% after ${rep.sentTotal} sends: copy/targeting review required`);
      actions.push('paused:low_reply');
      await this.alerts.raise('copy_review', 'warning', `Mailbox ${mb.address} paused: reply rate under 1% after 200 sends. Review targeting and copy before resuming.`, { mailboxId, rep });
    }
    // Domain-level complaint rate > 0.3% → burned, permanently.
    const domainReps = await Promise.all(mb.domainRef.mailboxes.map((m) => this.reputation(m.id)));
    const dSent = domainReps.reduce((s, r) => s + r.sent30d, 0);
    const dComplaints = domainReps.reduce((s, r) => s + r.complaintRate30d * r.sent30d, 0);
    if (dSent >= minSample && dComplaints / dSent > 0.003 && mb.domainRef.status !== 'burned') {
      await this.burnDomain(mb.domainRef.id, `complaint rate ${((dComplaints / dSent) * 100).toFixed(2)}% > 0.3% over 30 days`);
      actions.push('domain:burned');
    }
    await this.prisma.mailbox.update({ where: { id: mailboxId }, data: { reputation: rep as unknown as Prisma.InputJsonValue } });
    return actions;
  }

  async list(now = new Date()) {
    const boxes = await this.prisma.mailbox.findMany({ orderBy: { address: 'asc' }, include: { domainRef: true } });
    return Promise.all(boxes.map(async (mb) => ({ ...mb, warmupStage: MailboxService.warmupCap(mb.warmupStartedAt, now).week - 1, warmup: MailboxService.warmupCap(mb.warmupStartedAt, now), effectiveCap: this.effectiveCap(mb, now), usedToday: await this.usedToday(mb, now), reputation: await this.reputation(mb.id, now) })));
  }

  async capacity(now = new Date()) {
    const boxes = await this.prisma.mailbox.findMany({ where: { status: { in: ['active', 'warming'] } } });
    let dailyCeiling = 0, usedToday = 0;
    for (const mb of boxes) { dailyCeiling += this.effectiveCap(mb, now); usedToday += await this.usedToday(mb, now); }
    return { ceilingPerMailbox: MAILBOX_DAILY_CEILING, mailboxes: boxes.length, dailyCeiling, globalCap: this.env.MAX_SENDS_PER_DAY_GLOBAL, usedToday };
  }

  async setDailyCap(id: string, cap: number, actor: string) {
    const safe = Math.max(0, Math.min(MAILBOX_DAILY_CEILING, Math.floor(cap)));
    const mb = await this.prisma.mailbox.update({ where: { id }, data: { dailyCap: safe } });
    await this.audit.log('mailbox.cap_set', { requested: cap, applied: safe }, { actor, subjectId: id });
    return mb;
  }
}
