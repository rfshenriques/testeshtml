/**
 * Scheduling: bookable calls with the operator (from outreach emails and the proposal page) and simulated
 * bookings on concept mockups (from the sites' "book" actions).
 *
 * - Availability (weekly hours, slot length, notice, horizon, reminders, busy iCal feed) lives in the
 *   Setting table under `booking.availability`; defaults from prisma/src/defaults.ts.
 * - Free slots = weekly hours − existing meetings − events in the busy feed (cached 5 min) − notice.
 * - A booking creates a Meeting, emails the booker a confirmation (with a one-click confirm/cancel link
 *   and a calendar file), notifies the operator, logs a lead event, opens a CRM task, stops the outreach
 *   sequence (the lead has acted) and queues the reminders configured in availability.
 * - Mockup bookings use the business's own opening hours from the brief; nothing is emailed to anyone,
 *   the page confirms on screen and offers a calendar file. The booking is also recorded as a form
 *   submission so the operator sees that the mockup converted a visitor.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { Prisma, type Meeting } from '@sitewright/db';
import { DEFAULT_AVAILABILITY } from '@sitewright/db';
import { AvailabilitySchema, type Availability, type ContentBrief, type MeetingStatus } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { EMAIL_PROVIDER, EmailProvider } from '../outreach/email.types';
import { MailboxService } from '../outreach/mailbox.service';
import { SequenceService } from '../outreach/sequence.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { AuditService } from '../compliance/audit.service';
import { LinkTokenService } from '../compliance/link-token.service';
import { KillSwitchService } from '../ops/kill-switch.service';
import { AlertService } from '../ops/alert.service';
import { COUNTRY_TZ } from '../outreach/timing';
import { availabilityHours, buildIcs, computeSlots, formatInZone, hasAnyHours, isSlotAvailable, isValidTimeZone, parseIcsBusy, weeklyHoursFromOpeningHours, type Interval, type SlotQuery } from './availability';

export const AVAILABILITY_KEY = 'booking.availability';
const BUSY_CACHE_TTL_S = 300;
const ACTIVE: MeetingStatus[] = ['scheduled', 'confirmed'];

export interface BookingRequest { startAt: string; name: string; email: string; phone?: string | null; notes?: string | null; timezone?: string | null; source?: string | null }
export interface BookingContext { leadId: string | null; siteId: string | null; kind: 'agency_call' | 'mockup_demo' }

export class BookingError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

@Injectable()
export class SchedulingService {
  private readonly log = new Logger(SchedulingService.name);
  /** Injectable fetch for the busy feed (tests stub it). */
  fetchFn: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }> = (url) => fetch(url, { headers: { accept: 'text/calendar' } });

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly queues: QueueRegistry,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly mailboxes: MailboxService,
    private readonly sequence: SequenceService,
    private readonly leadEvents: LeadEventsService,
    private readonly audit: AuditService,
    private readonly links: LinkTokenService,
    private readonly killSwitch: KillSwitchService,
    private readonly alerts: AlertService,
  ) {}

  // --- availability ----------------------------------------------------------------------------------------------------

  async availability(): Promise<Availability> {
    const row = await this.prisma.setting.findUnique({ where: { key: AVAILABILITY_KEY } });
    const parsed = AvailabilitySchema.safeParse(row?.value ?? DEFAULT_AVAILABILITY);
    return parsed.success ? parsed.data : AvailabilitySchema.parse(DEFAULT_AVAILABILITY);
  }

  async setAvailability(value: unknown, actor: string): Promise<Availability> {
    const parsed = AvailabilitySchema.parse(value);
    if (!isValidTimeZone(parsed.timezone)) throw new BookingError(`unknown time zone ${parsed.timezone}`);
    await this.prisma.setting.upsert({ where: { key: AVAILABILITY_KEY }, create: { key: AVAILABILITY_KEY, value: parsed as unknown as Prisma.InputJsonValue }, update: { value: parsed as unknown as Prisma.InputJsonValue } });
    await this.audit.log('scheduling.availability_updated', { timezone: parsed.timezone, slotMinutes: parsed.slotMinutes, reminders: parsed.reminders }, { actor });
    await this.redis.del('booking:busyfeed');
    return parsed;
  }

  /** Busy intervals from the operator's iCal feed, cached. Failures degrade to "no external busy time" with a warning. */
  async busyFromFeed(a: Availability, window: Interval): Promise<Interval[]> {
    if (!a.busyFeedUrl) return [];
    const key = 'booking:busyfeed';
    let ics = await this.redis.get(key);
    if (!ics) {
      try {
        const r = await this.fetchFn(a.busyFeedUrl);
        if (!r.ok) throw new Error(`feed responded ${'status' in r ? (r as { status?: number }).status : 'error'}`);
        ics = await r.text();
        await this.redis.set(key, ics, 'EX', BUSY_CACHE_TTL_S);
      } catch (e) {
        this.log.warn(`busy feed unavailable: ${(e as Error).message}`);
        return [];
      }
    }
    return parseIcsBusy(ics, window);
  }

  private async bookedIntervals(where: Prisma.MeetingWhereInput, window: Interval): Promise<Interval[]> {
    const rows = await this.prisma.meeting.findMany({ where: { ...where, status: { in: ACTIVE }, startAt: { lt: window.end }, endAt: { gt: window.start } }, select: { startAt: true, endAt: true } });
    return rows.map((r) => ({ start: r.startAt, end: r.endAt }));
  }

  /** Free slots for a call with the operator. */
  async agencySlots(from: Date, days: number, now = new Date()): Promise<{ availability: Availability; slots: Date[]; to: Date }> {
    const a = await this.availability();
    const to = new Date(Math.min(from.getTime() + days * 86_400_000, now.getTime() + a.horizonDays * 86_400_000));
    const window = { start: from, end: to };
    const busy = [...(await this.bookedIntervals({ kind: 'agency_call' }, window)), ...(await this.busyFromFeed(a, window))];
    const q = this.agencyQuery(a, from, to, busy, now);
    return { availability: a, slots: computeSlots(q), to };
  }

  private agencyQuery(a: Availability, from: Date, to: Date, busy: Interval[], now: Date): SlotQuery {
    return { hours: availabilityHours(a), timezone: a.timezone, slotMinutes: a.slotMinutes, bufferMinutes: a.bufferMinutes, notBefore: new Date(now.getTime() + a.minNoticeHours * 3_600_000), from, to, busy };
  }

  /** Free slots on a mockup: the business's listed opening hours, 30-minute slots, bookings on that mockup block. */
  async siteSlots(siteId: string, from: Date, days: number, now = new Date()): Promise<{ timezone: string; slots: Date[]; hoursKnown: boolean; businessName: string; slotMinutes: number }> {
    const site = await this.prisma.generatedSite.findUniqueOrThrow({ where: { id: siteId }, include: { lead: { select: { countryCode: true, businessName: true } } } });
    const brief = site.contentBrief as unknown as ContentBrief;
    const timezone = COUNTRY_TZ[site.lead.countryCode] ?? 'Europe/Lisbon';
    const hours = weeklyHoursFromOpeningHours(brief.openingHours ?? []);
    const hoursKnown = hasAnyHours(hours);
    const fallback = { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [], sun: [] } as typeof hours;
    const to = new Date(from.getTime() + days * 86_400_000);
    const busy = await this.bookedIntervals({ siteId }, { start: from, end: to });
    const slots = computeSlots({ hours: hoursKnown ? hours : fallback, timezone, slotMinutes: 30, bufferMinutes: 0, notBefore: new Date(now.getTime() + 2 * 3_600_000), from, to, busy });
    return { timezone, slots, hoursKnown, businessName: site.lead.businessName, slotMinutes: 30 };
  }

  // --- booking -----------------------------------------------------------------------------------------------------------

  async book(ctx: BookingContext, req: BookingRequest, now = new Date()): Promise<Meeting> {
    const startAt = new Date(req.startAt);
    if (Number.isNaN(startAt.getTime())) throw new BookingError('invalid start time');
    const name = (req.name ?? '').trim();
    const email = (req.email ?? '').trim().toLowerCase();
    if (name.length < 2) throw new BookingError('please tell us your name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError('please enter a valid email address');
    const timezone = req.timezone && isValidTimeZone(req.timezone) ? req.timezone : null;

    let slotMinutes: number;
    if (ctx.kind === 'agency_call') {
      const a = await this.availability();
      slotMinutes = a.slotMinutes;
      const window = { start: new Date(startAt.getTime() - 86_400_000), end: new Date(startAt.getTime() + 86_400_000) };
      const busy = [...(await this.bookedIntervals({ kind: 'agency_call' }, window)), ...(await this.busyFromFeed(a, window))];
      if (!isSlotAvailable(this.agencyQuery(a, window.start, window.end, busy, now), startAt)) throw new BookingError('that time is no longer available; please pick another slot', 409);
    } else {
      if (!ctx.siteId) throw new BookingError('no site');
      const s = await this.siteSlots(ctx.siteId, new Date(startAt.getTime() - 86_400_000), 2, now);
      slotMinutes = s.slotMinutes;
      if (!s.slots.some((x) => x.getTime() === startAt.getTime())) throw new BookingError('that time is no longer available; please pick another slot', 409);
    }
    const endAt = new Date(startAt.getTime() + slotMinutes * 60_000);
    const meeting = await this.prisma.meeting.create({
      data: { leadId: ctx.leadId, siteId: ctx.siteId, kind: ctx.kind, source: req.source ?? (ctx.kind === 'mockup_demo' ? 'mockup' : 'outreach'), startAt, endAt, timezone: timezone ?? (ctx.kind === 'agency_call' ? (await this.availability()).timezone : 'UTC'), name, email, phone: req.phone?.trim() || null, notes: req.notes?.trim().slice(0, 2000) || null },
    });

    if (ctx.kind === 'mockup_demo') {
      if (ctx.siteId) await this.prisma.formSubmission.create({ data: { siteId: ctx.siteId, payload: { formVariant: 'booking', meetingId: meeting.id, startAt: startAt.toISOString(), name, email, phone: meeting.phone, notes: meeting.notes } } });
      if (ctx.leadId) await this.leadEvents.emit(ctx.leadId, 'mockup.booking', { meetingId: meeting.id, startAt: startAt.toISOString() });
      return meeting;
    }

    // A call with the operator: tell everyone, stop chasing, open a task, queue reminders.
    if (ctx.leadId) {
      await this.leadEvents.emit(ctx.leadId, 'meeting.booked', { meetingId: meeting.id, startAt: startAt.toISOString(), source: meeting.source, name, email });
      await this.prisma.crmTask.create({ data: { leadId: ctx.leadId, title: `Call with ${name} (${meeting.source}) — ${formatInZone(startAt, (await this.availability()).timezone)}`, dueAt: startAt } });
      const lead = await this.prisma.lead.findUnique({ where: { id: ctx.leadId }, select: { sequenceStartedAt: true, sequenceStoppedAt: true } });
      if (lead?.sequenceStartedAt && !lead.sequenceStoppedAt) await this.sequence.stop(ctx.leadId, 'meeting booked', 'booking').catch((e) => this.log.warn(`stop sequence: ${e}`));
    }
    await this.audit.log('meeting.booked', { meetingId: meeting.id, startAt: startAt.toISOString(), source: meeting.source }, { actor: 'public', leadId: ctx.leadId ?? undefined, subjectId: meeting.id });
    await this.sendBookingEmails(meeting, 'booked').catch((e) => this.log.warn(`booking emails: ${e}`));
    await this.scheduleReminders(meeting).catch((e) => this.log.warn(`reminders: ${e}`));
    return meeting;
  }

  async confirm(meetingId: string): Promise<Meeting> {
    const m = await this.prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    if (m.status === 'cancelled') throw new BookingError('this meeting was cancelled', 410);
    if (m.status === 'confirmed' || m.status === 'completed') return m;
    const updated = await this.prisma.meeting.update({ where: { id: meetingId }, data: { status: 'confirmed', confirmedAt: new Date() } });
    if (m.leadId) await this.leadEvents.emit(m.leadId, 'meeting.confirmed', { meetingId });
    return updated;
  }

  async cancel(meetingId: string, reason: string, actor: string): Promise<Meeting> {
    const m = await this.prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    if (m.status === 'cancelled') return m;
    const updated = await this.prisma.meeting.update({ where: { id: meetingId }, data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason.slice(0, 300) } });
    await this.removeReminders(meetingId);
    if (m.leadId) {
      await this.leadEvents.emit(m.leadId, 'meeting.cancelled', { meetingId, reason, actor });
      await this.prisma.crmTask.updateMany({ where: { leadId: m.leadId, doneAt: null, title: { contains: m.name } }, data: { doneAt: new Date() } });
    }
    await this.audit.log('meeting.cancelled', { meetingId, reason }, { actor, leadId: m.leadId ?? undefined, subjectId: meetingId });
    if (m.kind === 'agency_call') await this.sendBookingEmails(updated, 'cancelled').catch((e) => this.log.warn(`cancel emails: ${e}`));
    return updated;
  }

  async setOutcome(meetingId: string, status: 'completed' | 'no_show', actor: string): Promise<Meeting> {
    const m = await this.prisma.meeting.update({ where: { id: meetingId }, data: { status } });
    if (m.leadId) await this.leadEvents.emit(m.leadId, `meeting.${status}`, { meetingId, actor });
    await this.removeReminders(meetingId);
    return m;
  }

  async resendConfirmation(meetingId: string) {
    const m = await this.prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await this.sendBookingEmails(m, 'booked');
  }

  async list(opts: { upcoming?: boolean; leadId?: string; take?: number } = {}) {
    const now = new Date();
    return this.prisma.meeting.findMany({
      where: { ...(opts.leadId ? { leadId: opts.leadId } : {}), ...(opts.upcoming ? { endAt: { gte: now }, status: { in: ACTIVE } } : {}) },
      orderBy: opts.upcoming ? { startAt: 'asc' } : { startAt: 'desc' },
      take: opts.take ?? 200,
      include: { lead: { select: { id: true, businessName: true, city: true, countryCode: true, stage: true } } },
    });
  }

  // --- reminders ---------------------------------------------------------------------------------------------------------

  async scheduleReminders(meeting: Meeting, now = new Date()) {
    if (meeting.kind !== 'agency_call') return;
    const a = await this.availability();
    const q = this.queues.get('meetingReminder');
    await this.removeReminders(meeting.id);
    for (let i = 0; i < a.reminders.length; i++) {
      const r = a.reminders[i]!;
      const at = meeting.startAt.getTime() - r.hoursBefore * 3_600_000;
      if (at <= now.getTime() + 60_000) continue; // too late for this reminder: skip it
      await q.add('remind', { meetingId: meeting.id, index: i, confirm: r.confirm, hoursBefore: r.hoursBefore }, { jobId: `mr-${meeting.id}-${i}`, delay: at - now.getTime(), attempts: 3, backoff: { type: 'exponential', delay: 60_000 } });
    }
  }

  async removeReminders(meetingId: string) {
    const q = this.queues.get('meetingReminder');
    for (let i = 0; i < 6; i++) {
      const job = await q.getJob(`mr-${meetingId}-${i}`).catch(() => null);
      if (job) await job.remove().catch(() => undefined);
    }
  }

  /** Worker entry point. Sends the reminder (or the confirm request) if the meeting is still on. */
  async sendReminder(meetingId: string, index: number, confirmRequested: boolean, hoursBefore: number): Promise<'sent' | 'skipped'> {
    const m = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m || !ACTIVE.includes(m.status as MeetingStatus) || m.endAt < new Date()) return 'skipped';
    const askToConfirm = confirmRequested && m.status !== 'confirmed';
    await this.sendBookingEmails(m, askToConfirm ? 'confirm' : 'reminder', hoursBefore);
    const sent = Array.isArray(m.remindersSent) ? (m.remindersSent as unknown[]) : [];
    await this.prisma.meeting.update({ where: { id: meetingId }, data: { remindersSent: [...sent, { index, at: new Date().toISOString(), kind: askToConfirm ? 'confirm' : 'reminder', hoursBefore }] as unknown as Prisma.InputJsonValue } });
    if (m.leadId) await this.leadEvents.emit(m.leadId, 'meeting.reminder_sent', { meetingId, kind: askToConfirm ? 'confirm' : 'reminder', hoursBefore });
    return 'sent';
  }

  // --- links + email -------------------------------------------------------------------------------------------------------

  bookingUrl(leadId: string, source: 'outreach' | 'proposal' = 'outreach'): string {
    return `${this.env.APP_BASE_URL}/book/${this.links.sign({ p: 'book', leadId })}${source === 'proposal' ? '?src=proposal' : ''}`;
  }
  manageUrl(meeting: Pick<Meeting, 'id' | 'leadId'>): string {
    return `${this.env.APP_BASE_URL}/m/${this.links.sign({ p: 'meeting', leadId: meeting.leadId ?? '', meetingId: meeting.id })}`;
  }
  icsFor(meeting: Meeting, opts: { cancelled?: boolean; organizerEmail?: string | null; businessName?: string | null } = {}): string {
    const isMockup = meeting.kind === 'mockup_demo';
    const summary = isMockup ? `Appointment at ${opts.businessName ?? 'the business'} (mockup booking)` : `${this.env.AGENCY_NAME}: call with ${meeting.name}`;
    const description = isMockup
      ? `Demonstration booking made on a concept mockup prepared by ${this.env.AGENCY_NAME}. Nothing was sent to ${opts.businessName ?? 'the business'}.`
      : `Call about the website mockup. Manage or cancel: ${this.manageUrl(meeting)}${meeting.notes ? `\n\nNotes: ${meeting.notes}` : ''}`;
    return buildIcs({ uid: `${meeting.id}@sitewright`, start: meeting.startAt, end: meeting.endAt, summary, description, organizerName: isMockup ? (opts.businessName ?? 'Business') : this.env.AGENCY_NAME, organizerEmail: opts.organizerEmail ?? null, attendeeName: meeting.name, attendeeEmail: meeting.email, url: isMockup ? undefined : this.manageUrl(meeting), cancelled: opts.cancelled });
  }

  /** Confirmation / confirm-request / reminder / cancellation to the booker, plus a copy to the operator's notify address. Transactional: not an outreach touch. */
  async sendBookingEmails(meeting: Meeting, kind: 'booked' | 'confirm' | 'reminder' | 'cancelled', hoursBefore?: number) {
    if (meeting.kind !== 'agency_call') return;
    if (await this.killSwitch.isEngaged()) {
      await this.alerts.raise('scheduling', 'warning', `Kill switch engaged: ${kind} email for meeting ${meeting.id} not sent`, { meetingId: meeting.id });
      return;
    }
    const a = await this.availability();
    const mailbox = (await this.mailboxes.pickMailbox()) ?? (await this.prisma.mailbox.findFirst({ where: { status: { in: ['active', 'warming'] } } }));
    if (!mailbox) {
      await this.alerts.raise('scheduling', 'warning', `No mailbox available to send the ${kind} email for meeting ${meeting.id}`, { meetingId: meeting.id });
      return;
    }
    const when = formatInZone(meeting.startAt, meeting.timezone);
    const manage = this.manageUrl(meeting);
    const sign = `\n\n${this.env.AGENCY_NAME}\n${this.env.LEGAL_ENTITY_NAME} · ${this.env.LEGAL_ENTITY_ADDRESS}`;
    const calendar = `Add it to your calendar: ${manage}/ics`;
    let subject: string;
    let text: string;
    switch (kind) {
      case 'booked':
        subject = `Confirmed: ${a.meetingTitle} on ${formatInZone(meeting.startAt, meeting.timezone).split(' (')[0]}`;
        text = `Hi ${meeting.name},\n\nYour ${a.meetingTitle} with ${this.env.AGENCY_NAME} is booked for:\n\n  ${when}\n\n${calendar}\n\nWe'll call ${meeting.phone ? `you on ${meeting.phone}` : 'you'} at that time, or send a video link beforehand. Need to change or cancel? Use this link: ${manage}${sign}`;
        break;
      case 'confirm':
        subject = `Please confirm: ${a.meetingTitle} on ${formatInZone(meeting.startAt, meeting.timezone).split(' (')[0]}`;
        text = `Hi ${meeting.name},\n\nA quick check that our call is still on:\n\n  ${when}\n\nPlease confirm with one click: ${manage}?confirm=1\n\nIf the time no longer works, reschedule or cancel here: ${manage}\n\n${calendar}${sign}`;
        break;
      case 'reminder':
        subject = `Reminder: ${a.meetingTitle} ${hoursBefore && hoursBefore <= 3 ? 'soon' : `in ${Math.round((hoursBefore ?? 24) / 24) >= 1 ? `${Math.round((hoursBefore ?? 24) / 24)} day${Math.round((hoursBefore ?? 24) / 24) === 1 ? '' : 's'}` : `${hoursBefore} hours`}`}`;
        text = `Hi ${meeting.name},\n\nA reminder of our call:\n\n  ${when}\n\n${calendar}\n\nChange or cancel: ${manage}${sign}`;
        break;
      case 'cancelled':
        subject = `Cancelled: ${a.meetingTitle} on ${formatInZone(meeting.startAt, meeting.timezone).split(' (')[0]}`;
        text = `Hi ${meeting.name},\n\nThe call booked for ${when} has been cancelled${meeting.cancelReason ? ` (${meeting.cancelReason})` : ''}.\n\nTo book another time: ${meeting.leadId ? this.bookingUrl(meeting.leadId) : this.env.AGENCY_URL}${sign}`;
        break;
    }
    const from = { address: mailbox.address, name: this.env.AGENCY_NAME };
    await this.provider.send({ from, to: meeting.email, subject, text, headers: {}, replyTo: a.notifyEmail ?? mailbox.address, tags: { kind: `meeting.${kind}` } });
    if (a.notifyEmail && (kind === 'booked' || kind === 'cancelled')) {
      const lead = meeting.leadId ? await this.prisma.lead.findUnique({ where: { id: meeting.leadId }, select: { businessName: true, city: true } }) : null;
      const who = `${meeting.name} <${meeting.email}>${meeting.phone ? `, ${meeting.phone}` : ''}${lead ? ` — ${lead.businessName}${lead.city ? `, ${lead.city}` : ''}` : ''}`;
      await this.provider.send({
        from, to: a.notifyEmail, subject: `${kind === 'booked' ? 'New booking' : 'Booking cancelled'}: ${who}`,
        text: `${kind === 'booked' ? 'New call booked' : 'Call cancelled'}\n\nWhen: ${formatInZone(meeting.startAt, a.timezone)}\nWith: ${who}\nSource: ${meeting.source}\nNotes: ${meeting.notes ?? '—'}\n\nCalendar file: ${manage}/ics\nConsole: ${this.env.APP_BASE_URL}/meetings`,
        headers: {}, tags: { kind: `meeting.notify.${kind}` },
      }).catch((e) => this.log.warn(`notify email: ${e}`));
    }
  }
}
