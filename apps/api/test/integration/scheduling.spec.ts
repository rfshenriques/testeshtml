import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { FakeSiteBuilder } from '../fake-builder';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AstroSiteBuilder } from '../../src/modules/generator/site-builder.service';
import { GeneratorService } from '../../src/modules/generator/generator.service';
import { PreviewService } from '../../src/modules/preview/preview.service';
import { LlmService, FakeLlmClient } from '../../src/shared/llm/llm.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { EMAIL_PROVIDER } from '../../src/modules/outreach/email.types';
import { QueueRegistry } from '../../src/shared/queues/queue-registry.service';
import { SchedulingService } from '../../src/modules/scheduling/scheduling.service';
import { buildIcs, computeSlots, parseHoursText, parseIcsBusy, weeklyHoursFromOpeningHours } from '../../src/modules/scheduling/availability';
import { fromZoned } from '../../src/modules/outreach/timing';

const CLASSIFICATION = { vertical: 'dental', subVertical: 'general dental practice', servicesOffered: ['check-ups'], differentiators: ['evening appointments'], toneOfVoice: 'clinical', primaryCTA: 'book', languageCode: 'en', confidence: 0.95, insufficientData: false };
const COPY = { meta: { title: 'Valletta Dental Clinic', description: 'Family dental care in Valletta.' }, hero: { headline: 'Dentistry that puts you at ease', subhead: 'Clear explanations and gentle treatment.', ctaLabel: 'Book now' }, about: { heading: 'About', body: 'Valletta Dental Clinic offers routine check-ups, hygiene visits and cosmetic treatments in a calm setting. Each visit begins with a clear explanation of what we recommend and why, so you can decide without pressure.' }, services: [{ name: 'Check-ups', description: 'Routine examinations with a clear summary of what we find and a plan for anything that needs attention.' }], whyUs: [{ title: 'Clear explanations', body: 'You always know what we recommend and why.' }], cta: { heading: 'Book your next appointment', body: 'Request a time that suits you.', buttonLabel: 'Request an appointment' }, placeholdersUsed: [] };

/** Next Tuesday at 10:00 in the availability zone, at least 2 days out (clears the 4 h notice and sits inside Mon–Fri hours). */
function nextTuesday10(tz: string): Date {
  const d = new Date(Date.now() + 2 * 86400_000);
  for (let i = 0; i < 8; i++) {
    const probe = new Date(d.getTime() + i * 86400_000);
    const y = probe.getUTCFullYear(), m = probe.getUTCMonth() + 1, day = probe.getUTCDate();
    const at = fromZoned(y, m, day, 10, 0, tz);
    if (new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(at) === 'Tue') return at;
  }
  throw new Error('no tuesday');
}

describe('scheduling maths', () => {
  it('parses Google opening-hours text', () => {
    expect(parseHoursText('9:00 AM – 5:30 PM')).toEqual([['09:00', '17:30']]);
    expect(parseHoursText('9:00 – 17:30')).toEqual([['09:00', '17:30']]);
    expect(parseHoursText('9 AM – 1 PM, 2 – 6 PM')).toEqual([['09:00', '13:00'], ['14:00', '18:00']]);
    expect(parseHoursText('Closed')).toEqual([]);
    expect(parseHoursText('Open 24 hours')).toEqual([['00:00', '23:59']]);
    const week = weeklyHoursFromOpeningHours([{ day: 'Monday', hours: '8:30 AM – 6:30 PM' }, { day: 'Sunday', hours: 'Closed' }]);
    expect(week.mon).toEqual([['08:30', '18:30']]);
    expect(week.sun).toEqual([]);
  });

  it('computes slots inside weekly hours, honouring notice, bookings and the buffer', () => {
    const tz = 'Europe/Lisbon';
    const tue = nextTuesday10(tz);
    const dayStart = new Date(tue.getTime() - 10 * 3600_000);
    const hours = { mon: [], tue: [['10:00', '12:00']] as [string, string][], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const base = { hours, timezone: tz, slotMinutes: 30, bufferMinutes: 0, notBefore: new Date(0), from: dayStart, to: new Date(dayStart.getTime() + 86400_000), busy: [] };
    expect(computeSlots(base).map((d) => d.toISOString())).toEqual([0, 30, 60, 90].map((m) => new Date(tue.getTime() + m * 60_000).toISOString()));
    // A booking at 10:30–11:00 with a 15-minute buffer removes 10:00, 10:30 and 11:00.
    const busy = [{ start: new Date(tue.getTime() + 30 * 60_000), end: new Date(tue.getTime() + 60 * 60_000) }];
    expect(computeSlots({ ...base, busy, bufferMinutes: 15 }).map((d) => (d.getTime() - tue.getTime()) / 60_000)).toEqual([90]);
    // Notice cuts the first slot.
    expect(computeSlots({ ...base, notBefore: new Date(tue.getTime() + 1) }).length).toBe(3);
  });

  it('reads busy time from an iCal feed and writes a valid invite', () => {
    const start = new Date(Date.UTC(2026, 10, 3, 9, 0));
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'DTSTART:20261103T090000Z', 'DTEND:20261103T100000Z', 'SUMMARY:Dentist', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:b', 'DTSTART;TZID=Europe/Lisbon:20261103T150000', 'DTEND;TZID=Europe/Lisbon:20261103T160000', 'SUMMARY:Call', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261103T120000Z', 'DTEND:20261103T130000Z', 'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const busy = parseIcsBusy(ics, { start: new Date(Date.UTC(2026, 10, 1)), end: new Date(Date.UTC(2026, 10, 30)) });
    expect(busy).toHaveLength(2);
    expect(busy[0].start.toISOString()).toBe(start.toISOString());
    expect(busy[1].start.toISOString()).toBe(fromZoned(2026, 11, 3, 15, 0, 'Europe/Lisbon').toISOString());
    const out = buildIcs({ uid: 'x@sitewright', start, end: new Date(start.getTime() + 1800_000), summary: 'Call; with, you', description: 'line1\nline2', organizerName: 'Agency', organizerEmail: 'ops@agency.example', attendeeName: 'Anna', attendeeEmail: 'anna@example.com' });
    expect(out).toContain('BEGIN:VEVENT');
    expect(out).toContain('DTSTART:20261103T090000Z');
    expect(out).toContain('SUMMARY:Call\\; with\\, you');
    expect(out).toContain('DESCRIPTION:line1\\nline2');
    expect(out.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});

describe('Scheduling (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: any;
  let scheduling: SchedulingService;
  const builder = new FakeSiteBuilder();

  beforeAll(async () => {
    app = await createTestApp((b) => b.overrideProvider(AstroSiteBuilder).useValue(builder).overrideProvider(PLACES_CLIENT).useValue({ details: async () => { throw new Error('offline'); }, searchNearby: async () => [] }));
    prisma = app.get(PrismaService);
    provider = app.get(EMAIL_PROVIDER);
    scheduling = app.get(SchedulingService);
    const llm = new FakeLlmClient();
    llm.respond = () => JSON.stringify(COPY);
    app.get(LlmService).setClient(llm);
    app.get(GeneratorService).setImageSource({ search: async () => [] });
    const { MailboxService } = await import('../../src/modules/outreach/mailbox.service');
    const mailboxes = app.get(MailboxService);
    await mailboxes.addDomain('agency.example', 'test');
    const mb = await mailboxes.addMailbox('anna@agency.example', 'agency.example', 'test');
    await prisma.mailbox.update({ where: { id: mb.id }, data: { warmupStartedAt: new Date(Date.now() - 60 * 86400_000), dailyCap: 50, status: 'active' } });
  });
  afterAll(() => closeTestApp(app));

  it('exposes availability with defaults, validates updates and lists free slots', async () => {
    const a = await request(app.getHttpServer()).get('/admin/scheduling/availability').set(AUTH).expect(200);
    expect(a.body.slotMinutes).toBe(30);
    expect(a.body.reminders.some((r: any) => r.confirm)).toBe(true);
    await request(app.getHttpServer()).put('/admin/scheduling/availability').set(AUTH).send({ availability: { ...a.body, timezone: 'Mars/Olympus' } }).expect(400);
    const updated = await request(app.getHttpServer()).put('/admin/scheduling/availability').set(AUTH).send({ availability: { ...a.body, timezone: 'Europe/Lisbon', notifyEmail: 'ops@agency.example', bufferMinutes: 0 } }).expect(200);
    expect(updated.body.notifyEmail).toBe('ops@agency.example');
    const slots = await request(app.getHttpServer()).get('/admin/scheduling/slots?days=14').set(AUTH).expect(200);
    expect(slots.body.timezone).toBe('Europe/Lisbon');
    expect(slots.body.slots.length).toBeGreaterThan(20);
    // Every slot starts within the configured weekly hours (Mon–Fri) in the availability zone.
    for (const s of slots.body.slots) expect(['Sat', 'Sun']).not.toContain(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', weekday: 'short' }).format(new Date(s)));
  });

  it('lets a lead book a call from a signed link: confirmation + notify emails, CRM task, lead event, reminders, sequence stopped, slot taken', async () => {
    const lead = await makeLead(prisma, { businessName: 'Valletta Dental Clinic', email: 'anna@valletta-dental.example' });
    await prisma.lead.update({ where: { id: lead.id }, data: { sequenceStartedAt: new Date(), sequenceStoppedAt: null } });
    const url = scheduling.bookingUrl(lead.id);
    const token = url.split('/book/')[1].split('?')[0];
    const page = await request(app.getHttpServer()).get(`/book/${token}`).expect(200);
    expect(page.headers['x-robots-tag']).toContain('noindex');
    expect(page.text).toContain('anna@valletta-dental.example');
    expect(page.text).toContain('Pick a day');
    const slots = await request(app.getHttpServer()).get(`/book/${token}/slots`).expect(200);
    const startAt = slots.body.slots[5];
    const sentBefore = provider.sent.length;
    const r = await request(app.getHttpServer()).post(`/book/${token}`).set('accept', 'application/json').send({ startAt, name: 'Anna Camilleri', email: 'anna@valletta-dental.example', phone: '+356 2122 4455', notes: 'Thursday is best', timezone: 'Europe/Malta', source: 'proposal' }).expect(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.manageUrl).toContain('/m/');
    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: r.body.meetingId } });
    expect(meeting.kind).toBe('agency_call');
    expect(meeting.source).toBe('proposal');
    expect(meeting.leadId).toBe(lead.id);
    expect(meeting.timezone).toBe('Europe/Malta');
    // Emails: confirmation to the booker and a notification to the operator.
    const sent = provider.sent.slice(sentBefore);
    expect(sent.map((e: any) => e.to).sort()).toEqual(['anna@valletta-dental.example', 'ops@agency.example']);
    const conf = sent.find((e: any) => e.to === 'anna@valletta-dental.example');
    expect(conf.subject).toMatch(/^Confirmed:/);
    expect(conf.text).toContain(r.body.manageUrl);
    expect(conf.text).toContain('/ics');
    // CRM: task + events + sequence stopped.
    const tasks = await prisma.crmTask.findMany({ where: { leadId: lead.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueAt?.toISOString()).toBe(new Date(startAt).toISOString());
    const events = await prisma.leadEvent.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.type)).toContain('meeting.booked');
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.sequenceStoppedAt).not.toBeNull();
    expect(after.sequenceStopReason).toBe('meeting booked');
    // Reminders queued as delayed jobs (one per configured reminder that is still in the future).
    const q = app.get(QueueRegistry).get('meetingReminder');
    const jobs = await Promise.all([0, 1, 2].map((i) => q.getJob(`mr-${meeting.id}-${i}`)));
    expect(jobs.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    for (const j of jobs.filter(Boolean)) expect(await j!.getState()).toBe('delayed');
    // The slot is gone and double-booking is refused.
    const again = await request(app.getHttpServer()).get(`/book/${token}/slots`).expect(200);
    expect(again.body.slots).not.toContain(startAt);
    const dup = await request(app.getHttpServer()).post(`/book/${token}`).set('accept', 'application/json').send({ startAt, name: 'Someone Else', email: 'x@example.com' }).expect(409);
    expect(dup.body.message).toMatch(/no longer available/);
    // Validation.
    await request(app.getHttpServer()).post(`/book/${token}`).set('accept', 'application/json').send({ startAt: again.body.slots[0], name: 'A', email: 'nope' }).expect(400);
    // Lead detail carries the meeting; the admin list shows it upcoming.
    const detail = await request(app.getHttpServer()).get(`/admin/leads/${lead.id}`).set(AUTH).expect(200);
    expect(detail.body.meetings).toHaveLength(1);
    const list = await request(app.getHttpServer()).get('/admin/meetings?upcoming=1').set(AUTH).expect(200);
    expect(list.body.map((m: any) => m.id)).toContain(meeting.id);
  });

  it('manage page: one-click confirm from the email, calendar file, cancel removes reminders and emails both sides', async () => {
    const lead = await makeLead(prisma, { businessName: 'Sliema Smile', email: 'hello@sliema-smile.example' });
    const token = scheduling.bookingUrl(lead.id).split('/book/')[1].split('?')[0];
    const slots = await request(app.getHttpServer()).get(`/book/${token}/slots`).expect(200);
    const r = await request(app.getHttpServer()).post(`/book/${token}`).set('accept', 'application/json').send({ startAt: slots.body.slots[8], name: 'Maria Borg', email: 'hello@sliema-smile.example' }).expect(200);
    const manage = r.body.manageUrl.replace(/^https?:\/\/[^/]+/, '');
    // Reminder worker path: a confirm request goes out, then the one-click confirm link sets the status.
    const m0 = await prisma.meeting.findUniqueOrThrow({ where: { id: r.body.meetingId } });
    const before = provider.sent.length;
    expect(await scheduling.sendReminder(m0.id, 1, true, 24)).toBe('sent');
    const ask = provider.sent[before];
    expect(ask.subject).toMatch(/^Please confirm:/);
    expect(ask.text).toContain(`${r.body.manageUrl}?confirm=1`);
    const confirmed = await request(app.getHttpServer()).get(`${manage}?confirm=1`).expect(200);
    expect(confirmed.text).toContain('the call is confirmed');
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m0.id } })).status).toBe('confirmed');
    // Once confirmed, a later "confirm" reminder becomes a plain reminder.
    expect(await scheduling.sendReminder(m0.id, 2, true, 2)).toBe('sent');
    expect(provider.sent.at(-1).subject).toMatch(/^Reminder:/);
    const ics = await request(app.getHttpServer()).get(`${manage}/ics`).expect(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VEVENT');
    expect(ics.text.replace(/\r\n[ \t]/g, '')).toContain('mailto:hello@sliema-smile.example');
    // Cancel from the manage page.
    const sentBefore = provider.sent.length;
    await request(app.getHttpServer()).post(`${manage}/cancel`).type('form').send({ reason: 'clash' }).expect(302);
    const m = await prisma.meeting.findUniqueOrThrow({ where: { id: r.body.meetingId } });
    expect(m.status).toBe('cancelled');
    expect(m.cancelReason).toBe('clash');
    expect(provider.sent.slice(sentBefore).map((e: any) => e.subject)).toEqual(expect.arrayContaining([expect.stringMatching(/^Cancelled:/), expect.stringMatching(/^Booking cancelled/)]));
    const q = app.get(QueueRegistry).get('meetingReminder');
    for (const i of [0, 1, 2]) expect(await q.getJob(`mr-${m.id}-${i}`)).toBeFalsy();
    // Cancelled meetings are skipped by the worker and the manage page offers a new time.
    expect(await scheduling.sendReminder(m.id, 0, false, 72)).toBe('skipped');
    const page = await request(app.getHttpServer()).get(manage).expect(200);
    expect(page.text).toContain('pick another time');
    // Operator outcome endpoints.
    const lead2 = await makeLead(prisma, { businessName: 'Outcome Ltd', email: 'o@outcome.example' });
    const t2 = scheduling.bookingUrl(lead2.id).split('/book/')[1].split('?')[0];
    const s2 = await request(app.getHttpServer()).get(`/book/${t2}/slots`).expect(200);
    const b2 = await request(app.getHttpServer()).post(`/book/${t2}`).set('accept', 'application/json').send({ startAt: s2.body.slots[2], name: 'Paul Vella', email: 'o@outcome.example' }).expect(200);
    const done = await request(app.getHttpServer()).post(`/admin/meetings/${b2.body.meetingId}/complete`).set(AUTH).expect(201);
    expect(done.body.status).toBe('completed');
  });

  it('mockup booking: the site links to /p/:slug/book, slots follow the listing hours, a booking is a demo (no emails) recorded as a form submission', async () => {
    const lead = await makeLead(prisma, { businessName: 'Harbour Dental', email: 'info@harbour-dental.example' });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'profiled', classification: CLASSIFICATION } });
    await prisma.placeSnapshot.create({ data: { placeId: lead.placeId, kind: 'details', raw: { id: lead.placeId, regularOpeningHours: { weekdayDescriptions: ['Monday: 8:30 AM – 6:30 PM', 'Tuesday: 8:30 AM – 6:30 PM', 'Wednesday: 8:30 AM – 6:30 PM', 'Thursday: 8:30 AM – 6:30 PM', 'Friday: 8:30 AM – 1:00 PM', 'Saturday: Closed', 'Sunday: Closed'] } }, expiresAt: new Date(Date.now() + 10 * 86400_000) } });
    const gen = await app.get(GeneratorService).generate(lead.id, { advance: false });
    expect(gen.skipped).toBeFalsy();
    const input = builder.builds.at(-1)!;
    expect(input.mockup.bookingUrl).toContain(`/p/${gen.site!.previewSlug}/book`);
    // Not published yet: 404. Published: page + slots + booking.
    await request(app.getHttpServer()).get(`/p/${gen.site!.previewSlug}/book`).expect(404);
    await app.get(PreviewService).publish(lead.id);
    const page = await request(app.getHttpServer()).get(`/p/${gen.site!.previewSlug}/book`).expect(200);
    expect(page.headers['x-robots-tag']).toContain('noindex');
    expect(page.text).toContain('Unofficial concept mockup');
    expect(page.text).toContain('Book with Harbour Dental');
    const slots = await request(app.getHttpServer()).get(`/p/${gen.site!.previewSlug}/book/slots`).expect(200);
    expect(slots.body.timezone).toBe('Europe/Malta');
    expect(slots.body.slots.length).toBeGreaterThan(10);
    for (const s of slots.body.slots) {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Malta', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(s));
      const wd = p.find((x) => x.type === 'weekday')!.value;
      const h = Number(p.find((x) => x.type === 'hour')!.value);
      expect(['Sat', 'Sun']).not.toContain(wd);
      expect(h).toBeGreaterThanOrEqual(8);
      expect(h).toBeLessThan(wd === 'Fri' ? 13 : 19);
    }
    const sentBefore = provider.sent.length;
    const r = await request(app.getHttpServer()).post(`/p/${gen.site!.previewSlug}/book`).set('accept', 'application/json').send({ startAt: slots.body.slots[0], name: 'Visitor One', email: 'visitor@example.com', timezone: 'Europe/Malta' }).expect(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.icsUrl).toContain('/ics');
    expect(provider.sent.length).toBe(sentBefore); // demonstration only: nobody is emailed
    const m = await prisma.meeting.findUniqueOrThrow({ where: { id: r.body.meetingId } });
    expect(m.kind).toBe('mockup_demo');
    expect(m.siteId).toBe(gen.site!.id);
    expect(await prisma.formSubmission.count({ where: { siteId: gen.site!.id } })).toBe(1);
    expect(await prisma.crmTask.count({ where: { leadId: lead.id } })).toBe(0);
    const ics = await request(app.getHttpServer()).get(r.body.icsUrl.replace(/^https?:\/\/[^/]+/, '')).expect(200);
    expect(ics.text).toContain('mockup booking');
    // The same slot is now taken on that mockup; the preview pages themselves still serve.
    const again = await request(app.getHttpServer()).get(`/p/${gen.site!.previewSlug}/book/slots`).expect(200);
    expect(again.body.slots).not.toContain(slots.body.slots[0]);
    await request(app.getHttpServer()).get(`/p/${gen.site!.previewSlug}/`).expect(200);
  });

  it('outreach copy and the proposal page carry the per-lead booking link', async () => {
    const lead = await makeLead(prisma, { businessName: 'Copy Check Ltd', email: 'c@copycheck.example' });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'profiled', classification: CLASSIFICATION } });
    await app.get(GeneratorService).generate(lead.id, { advance: false });
    await app.get(PreviewService).publish(lead.id);
    const { QuotingService } = await import('../../src/modules/quoting/quoting.service');
    const quote = await app.get(QuotingService).createQuote(lead.id);
    const msg = await prisma.outreachMessage.findFirst({ where: { leadId: lead.id, sequenceStep: 1 } });
    expect(msg?.bodyText).toContain('/book/');
    const proposal = await request(app.getHttpServer()).get(`/q/${quote.slug}`).expect(200);
    expect(proposal.text).toContain('/book/');
    expect(proposal.text).toContain('src=proposal');
  });
});
