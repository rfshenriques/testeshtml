import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Prisma, OutreachMessage } from '@sitewright/db';
import { MAX_TOUCHES_PER_BUSINESS, ScoreBreakdown, SequenceConfigSchema, SequenceStep } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { AuditService } from '../compliance/audit.service';
import { LinkTokenService } from '../compliance/link-token.service';
import { GateService } from '../compliance/gate.service';
import { SuppressionService } from '../compliance/suppression.service';
import { MailboxService } from './mailbox.service';
import { gapSeconds, nextSendSlot, validateSubject } from './timing';
import { stepCopy } from './copy';
import { QuotingService } from '../quoting/quoting.service';
import { PreviewService } from '../preview/preview.service';

export const HAND_APPROVAL_COUNT = 20;
const APPROVED_SENDS_KEY = 'outreach.approvedSends';

/**
 * Sequence engine (spec §11.5): max 4 touches ever; step N+1 only if no reply; any reply stops
 * the sequence; closeout → permanent suppression; bridge step within 24 h of a preview view.
 * The first 20 sends are hand-approved by the operator (spec M8).
 */
@Injectable()
export class SequenceService implements OnModuleInit {
  private readonly log = new Logger(SequenceService.name);
  rand: () => number = Math.random;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly queues: QueueRegistry,
    private readonly leadEvents: LeadEventsService,
    private readonly audit: AuditService,
    private readonly gate: GateService,
    private readonly suppression: SuppressionService,
    private readonly mailboxes: MailboxService,
    private readonly quoting: QuotingService,
    private readonly preview: PreviewService,
    private readonly links: LinkTokenService,
  ) {}

  onModuleInit() {
    this.quoting.hooks.onQuoted = async (leadId) => {
      await this.start(leadId).catch((e) => this.log.warn({ leadId, err: (e as Error).message }, 'auto sequence start skipped'));
    };
    this.preview.hooks.onViewed = async (leadId, firstView) => {
      if (firstView) await this.bridge(leadId).catch((e) => this.log.warn({ leadId, err: (e as Error).message }, 'bridge skipped'));
    };
  }

  async config(): Promise<SequenceStep[]> {
    const row = await this.prisma.sequenceConfig.findUnique({ where: { id: 'default' } });
    return SequenceConfigSchema.parse(row?.steps ?? []);
  }

  async updateConfig(steps: unknown, actor: string) {
    const parsed = SequenceConfigSchema.parse(steps);
    if (parsed.length > MAX_TOUCHES_PER_BUSINESS) throw new Error(`max ${MAX_TOUCHES_PER_BUSINESS} steps`);
    await this.prisma.sequenceConfig.upsert({ where: { id: 'default' }, create: { id: 'default', steps: parsed as unknown as Prisma.InputJsonValue }, update: { steps: parsed as unknown as Prisma.InputJsonValue } });
    await this.audit.log('sequence.updated', { steps: parsed }, { actor });
    return parsed;
  }

  /** Touches already sent (or in flight) to this business, ever, across campaigns (keyed by place). */
  async touches(leadId: string): Promise<number> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { placeId: true } });
    return this.prisma.outreachMessage.count({ where: { lead: { placeId: lead.placeId }, kind: { in: ['sequence', 'bridge'] }, status: { notIn: ['cancelled', 'failed'] } } });
  }

  async start(leadId: string, actor = 'system'): Promise<OutreachMessage> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contacts: { where: { isPrimary: true } }, site: true, quote: true } });
    if (lead.stage === 'suppressed') throw new Error('lead suppressed');
    if (lead.fallbackChannel !== 'email') throw new Error(`lead is in the ${lead.fallbackChannel} bucket`);
    if (lead.sequenceStartedAt && !lead.sequenceStoppedAt) throw new Error('sequence already running');
    if (!lead.site?.previewUrl || lead.site.takenDownAt) throw new Error('no live preview to send');
    const contact = lead.contacts[0];
    if (!contact || contact.verification !== 'valid') throw new Error('no valid primary contact');
    await this.gate.assertClear(leadId, contact.id);
    const steps = await this.config();
    const first = steps.find((s) => s.step === 1);
    if (!first) throw new Error('sequence has no step 1');
    await this.prisma.lead.update({ where: { id: leadId }, data: { sequenceStartedAt: new Date(), sequenceStoppedAt: null, sequenceStopReason: null } });
    await this.leadEvents.emit(leadId, 'sequence.started', { actor });
    return this.schedule(leadId, first, new Date());
  }

  /** Create + schedule one step (or a bridge) for a lead. */
  async schedule(leadId: string, step: SequenceStep | { step: number; kind: 'bridge'; delayDays: number }, earliest: Date): Promise<OutreachMessage> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contacts: { where: { isPrimary: true } }, site: true, quote: true, campaign: true } });
    const contact = lead.contacts[0];
    if (!contact) throw new Error('no primary contact');
    if ((await this.touches(leadId)) >= MAX_TOUCHES_PER_BUSINESS) throw new Error(`max ${MAX_TOUCHES_PER_BUSINESS} touches reached`);
    const mailbox = await this.mailboxes.pickMailbox();
    if (!mailbox) throw new Error('no mailbox with headroom');
    const copy = stepCopy(step.kind, {
      businessName: lead.businessName, city: lead.city, vertical: lead.vertical, primaryType: lead.primaryType, countryCode: lead.countryCode,
      breakdown: (lead.scoreBreakdown as unknown as ScoreBreakdown) ?? null, websiteStatus: lead.websiteStatus, rating: lead.rating, reviewCount: lead.reviewCount,
      previewUrl: lead.site!.previewUrl!, quoteUrl: lead.quote ? this.quoting.quoteUrl(lead.quote.slug) : null, expiresAt: lead.site!.expiresAt,
      agencyName: this.env.AGENCY_NAME, senderName: this.env.AGENCY_NAME, languageCode: lead.campaign.languageCode ?? 'en',
      bookingUrl: `${this.env.APP_BASE_URL}/book/${this.links.sign({ p: 'book', leadId })}`,
    });
    const subj = validateSubject(copy.subject);
    const subject = subj.ok ? copy.subject : fallbackSubject(step.kind);
    // Timing: step delay → next Tue–Thu window in the recipient's zone → spaced ≥90–400 s after the mailbox's last scheduled send.
    let at = nextSendSlot(earliest, lead.countryCode, this.rand);
    const lastKey = `mailbox:${mailbox.id}:lastScheduled`;
    const last = Number((await this.redis.get(lastKey)) ?? 0);
    if (last && at.getTime() < last + MIN_GAP_MS) at = new Date(last + gapSeconds(this.rand) * 1000);
    await this.redis.set(lastKey, String(at.getTime()), 'EX', 7 * 86400);
    const approvedSoFar = await this.approvedSends();
    const requiresApproval = approvedSoFar < HAND_APPROVAL_COUNT;
    const msg = await this.prisma.outreachMessage.create({
      data: { leadId, contactId: contact.id, sequenceStep: step.step, kind: step.kind === 'bridge' ? 'bridge' : 'sequence', mailboxId: mailbox.id, subject, bodyText: copy.text, bodyHtml: '', status: 'queued', scheduledFor: at, requiresApproval },
    });
    await this.leadEvents.emit(leadId, 'message.scheduled', { messageId: msg.id, step: step.step, kind: msg.kind, scheduledFor: at.toISOString(), requiresApproval, mailbox: mailbox.address });
    if (!requiresApproval) await this.enqueueSend(msg);
    return msg;
  }

  async enqueueSend(msg: OutreachMessage) {
    const delay = Math.max(0, (msg.scheduledFor?.getTime() ?? Date.now()) - Date.now());
    await this.queues.get('outreachSend').add('send', { messageId: msg.id, leadId: msg.leadId }, { jobId: `send-${msg.id}`, delay, attempts: 1 });
  }

  async approvedSends(): Promise<number> {
    const row = await this.prisma.setting.findUnique({ where: { key: APPROVED_SENDS_KEY } });
    return Number(row?.value ?? 0);
  }

  async approve(messageId: string, actor: string) {
    const msg = await this.prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
    if (msg.status !== 'queued') throw new Error(`message is ${msg.status}`);
    const updated = await this.prisma.outreachMessage.update({ where: { id: messageId }, data: { approvedAt: new Date(), approvedBy: actor } });
    const n = (await this.approvedSends()) + 1;
    await this.prisma.setting.upsert({ where: { key: APPROVED_SENDS_KEY }, create: { key: APPROVED_SENDS_KEY, value: n }, update: { value: n } });
    await this.audit.log('message.approved', { messageId, approvedCount: n }, { actor, leadId: msg.leadId, subjectId: messageId });
    await this.enqueueSend(updated);
    return updated;
  }

  async cancel(messageId: string, actor: string, reason = 'operator') {
    const msg = await this.prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
    if (msg.status !== 'queued') return msg;
    await this.queues.get('outreachSend').remove(`send-${messageId}`).catch(() => undefined);
    const updated = await this.prisma.outreachMessage.update({ where: { id: messageId }, data: { status: 'cancelled', error: reason } });
    await this.audit.log('message.cancelled', { reason }, { actor, leadId: msg.leadId, subjectId: messageId });
    return updated;
  }

  /** Any reply, suppression, or operator action stops the sequence immediately. Cancels queued messages. */
  async stop(leadId: string, reason: string, actor = 'system') {
    const queued = await this.prisma.outreachMessage.findMany({ where: { leadId, status: 'queued' } });
    for (const m of queued) await this.cancel(m.id, actor, reason);
    await this.prisma.lead.update({ where: { id: leadId }, data: { sequenceStoppedAt: new Date(), sequenceStopReason: reason } });
    await this.leadEvents.emit(leadId, 'sequence.stopped', { reason, cancelled: queued.length, actor });
    return queued.length;
  }

  /** After a step was sent: schedule the next step (if any) relative to step 1's send time; closeout → permanent suppression. */
  async afterSent(msg: OutreachMessage) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId(msg) }, include: { replies: true } });
    if (lead.sequenceStoppedAt || lead.replies.length) return;
    const steps = await this.config();
    const current = steps.find((s) => s.step === msg.sequenceStep);
    if (msg.kind === 'sequence' && current?.kind === 'closeout') {
      await this.suppression.suppressLead(lead.id, 'sequence_complete', { actor: 'system', note: 'sequence completed without reply' });
      await this.prisma.lead.update({ where: { id: lead.id }, data: { sequenceStoppedAt: new Date(), sequenceStopReason: 'sequence complete' } });
      return;
    }
    const next = steps.filter((s) => s.step > msg.sequenceStep).sort((a, b) => a.step - b.step)[0];
    if (!next) return;
    const touches = await this.touches(lead.id);
    // Max 4 touches ever: if a bridge used up a slot, skip the nudge/quote step so the closeout still fits.
    const remainingSlots = MAX_TOUCHES_PER_BUSINESS - touches;
    const remainingSteps = steps.filter((s) => s.step > msg.sequenceStep);
    const toSchedule = remainingSteps.length > remainingSlots ? remainingSteps.slice(remainingSteps.length - remainingSlots)[0] : next;
    if (!toSchedule) return;
    const first = await this.prisma.outreachMessage.findFirst({ where: { leadId: lead.id, sequenceStep: 1, sentAt: { not: null } }, orderBy: { sentAt: 'asc' } });
    const base = first?.sentAt ?? msg.sentAt ?? new Date();
    const earliest = new Date(Math.max(base.getTime() + toSchedule.delayDays * 86400_000, Date.now() + 60_000));
    await this.schedule(lead.id, toSchedule, earliest);
  }

  /** Preview viewed but no reply → bridge message within 24 h (spec §11.5). Counts as a touch. */
  async bridge(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { replies: true, messages: true } });
    if (!lead.sequenceStartedAt || lead.sequenceStoppedAt || lead.replies.length) return null;
    if (!lead.messages.some((m) => m.sentAt)) return null; // nothing sent yet: the view came from elsewhere
    if (lead.messages.some((m) => m.kind === 'bridge')) return null;
    if ((await this.touches(leadId)) >= MAX_TOUCHES_PER_BUSINESS) return null;
    const earliest = new Date(Date.now() + 60 * 60_000);
    const msg = await this.schedule(leadId, { step: 0, kind: 'bridge', delayDays: 0 }, earliest);
    if (msg.scheduledFor && msg.scheduledFor.getTime() - Date.now() > 24 * 3600_000) {
      // Outside the 24 h window (weekend): still send at the next allowed slot but log it.
      this.log.warn({ leadId, scheduledFor: msg.scheduledFor }, 'bridge step scheduled beyond 24 h due to send-window rules');
    }
    return msg;
  }

  /** Out-of-office: push remaining steps by 7 days, not counted as a touch. */
  async postpone(leadId: string, days = 7) {
    const queued = await this.prisma.outreachMessage.findMany({ where: { leadId, status: 'queued' } });
    for (const m of queued) {
      const at = nextSendSlot(new Date((m.scheduledFor ?? new Date()).getTime() + days * 86400_000), (await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).countryCode, this.rand);
      await this.queues.get('outreachSend').remove(`send-${m.id}`).catch(() => undefined);
      const updated = await this.prisma.outreachMessage.update({ where: { id: m.id }, data: { scheduledFor: at } });
      if (updated.approvedAt || !updated.requiresApproval) await this.enqueueSend(updated);
    }
    await this.leadEvents.emit(leadId, 'sequence.postponed', { days, messages: queued.length });
  }

  async approvalQueue() {
    const rows = await this.prisma.outreachMessage.findMany({ where: { status: 'queued', requiresApproval: true, approvedAt: null }, orderBy: { scheduledFor: 'asc' }, include: { contact: true, lead: { select: leadSelect } }, take: 200 });
    return rows.map((r) => ({ ...r, lead: summarise(r.lead) }));
  }

  async scheduleOverview(days = 7) {
    const until = new Date(Date.now() + days * 86400_000);
    const rows = await this.prisma.outreachMessage.findMany({ where: { status: 'queued', scheduledFor: { lte: until } }, select: { mailboxId: true, scheduledFor: true, mailbox: { select: { address: true, dailyCap: true, warmupStartedAt: true } } } });
    const map = new Map<string, { day: string; mailboxId: string; address: string; scheduled: number; cap: number }>();
    for (const r of rows) {
      const day = (r.scheduledFor ?? new Date()).toISOString().slice(0, 10);
      const key = `${day}|${r.mailboxId}`;
      const cur = map.get(key) ?? { day, mailboxId: r.mailboxId, address: r.mailbox.address, scheduled: 0, cap: Math.min(r.mailbox.dailyCap, MailboxService.warmupCap(r.mailbox.warmupStartedAt, new Date(day)).cap) };
      cur.scheduled++;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day) || a.address.localeCompare(b.address));
  }
}

const MIN_GAP_MS = 90_000;
const leadId = (m: OutreachMessage) => m.leadId;
function fallbackSubject(kind: string) {
  return ({ opener: 'a website for your business', nudge: 'the mockup i built', quote: 'what the website would cost', closeout: 'taking the mockup down', bridge: 'saw you opened the mockup' } as Record<string, string>)[kind] ?? 'your website';
}
import { leadSummarySelect as leadSelect, toLeadSummary as summarise } from '../crm/lead-summary';
