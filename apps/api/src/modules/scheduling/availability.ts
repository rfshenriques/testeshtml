/**
 * Pure scheduling maths: free slots from weekly hours, busy intervals and bookings; Google-style
 * opening-hours parsing for mockup bookings; minimal iCalendar parsing (busy feeds) and generation.
 * No I/O here, so every rule is unit-testable.
 */
import type { Availability, DayKey } from '@sitewright/shared-types';
import { DAY_KEYS } from '@sitewright/shared-types';
import { fromZoned, zonedParts } from '../outreach/timing';

export interface Interval { start: Date; end: Date }
export type WeeklyHours = Record<DayKey, [string, string][]>;

export interface SlotQuery {
  /** Weekly hours and the zone they are expressed in. */
  hours: WeeklyHours;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  /** Earliest bookable instant (now + notice). */
  notBefore: Date;
  from: Date;
  to: Date;
  busy: Interval[];
}

const DAY_FROM_WEEKDAY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function hhmm(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

/** Slot starts (UTC instants) between `from` and `to` that fit entirely inside the weekly hours and clear every busy interval (+ buffer). */
export function computeSlots(q: SlotQuery): Date[] {
  const out: Date[] = [];
  const slotMs = q.slotMinutes * 60_000;
  const bufferMs = q.bufferMinutes * 60_000;
  const busy = q.busy.map((b) => ({ start: b.start.getTime() - bufferMs, end: b.end.getTime() + bufferMs }));
  const minStart = Math.max(q.from.getTime(), q.notBefore.getTime());
  // Walk calendar days in the availability zone, from the day containing `from` to the day containing `to`.
  for (let t = q.from.getTime() - 86_400_000; t <= q.to.getTime() + 86_400_000; t += 86_400_000) {
    const p = zonedParts(new Date(t), q.timezone);
    const ranges = q.hours[DAY_FROM_WEEKDAY[p.weekday]!] ?? [];
    for (const [a, b] of ranges) {
      const [ah, am] = hhmm(a);
      const [bh, bm] = hhmm(b);
      const rangeStart = fromZoned(p.year, p.month, p.day, ah, am, q.timezone).getTime();
      const rangeEnd = fromZoned(p.year, p.month, p.day, bh, bm, q.timezone).getTime();
      for (let s = rangeStart; s + slotMs <= rangeEnd; s += slotMs) {
        const e = s + slotMs;
        if (s < minStart || s >= q.to.getTime()) continue;
        if (busy.some((x) => s < x.end && e > x.start)) continue;
        if (out.length && out[out.length - 1]!.getTime() === s) continue;
        out.push(new Date(s));
      }
    }
  }
  return out.sort((x, y) => x.getTime() - y.getTime());
}

export function isSlotAvailable(q: SlotQuery, start: Date): boolean {
  return computeSlots({ ...q, from: new Date(start.getTime() - 1), to: new Date(start.getTime() + q.slotMinutes * 60_000 + 1) }).some((s) => s.getTime() === start.getTime());
}

const DAY_NAMES: Record<string, DayKey> = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };

/** "9:00 AM – 5:30 PM", "9:00 – 17:30", "Open 24 hours", "Closed", "9 AM – 1 PM, 2 – 6 PM" → [["09:00","17:30"]]. */
export function parseHoursText(text: string): [string, string][] {
  const t = text.trim().toLowerCase().replace(/\u2009|\u202f/g, ' ');
  if (!t || t.includes('closed')) return [];
  if (t.includes('24 hours') || t === 'open 24 hours') return [['00:00', '23:59']];
  const out: [string, string][] = [];
  for (const part of t.split(/,|;/)) {
    const m = part.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!m) continue;
    const toMin = (h: string, mm: string | undefined, ap: string | undefined, fallbackAp: string | undefined) => {
      let hour = Number(h);
      const meridiem = ap ?? fallbackAp;
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      return [hour, Number(mm ?? '0')] as const;
    };
    const [sh, sm] = toMin(m[1]!, m[2], m[3], m[6]);
    let [eh, em] = toMin(m[4]!, m[5], m[6], m[3]);
    if (eh === 0 && em === 0 && sh > 0) { eh = 23; em = 59; } // "… – 12:00 AM" = midnight
    if (eh < sh || (eh === sh && em <= sm)) continue;
    const f = (n: number) => String(n).padStart(2, '0');
    out.push([`${f(sh)}:${f(sm)}`, `${f(eh)}:${f(em)}`]);
  }
  return out;
}

/** Weekly hours from a brief's `openingHours` (Google weekday descriptions split into day + text). */
export function weeklyHoursFromOpeningHours(rows: { day: string; hours: string }[]): WeeklyHours {
  const week = Object.fromEntries(DAY_KEYS.map((d) => [d, []])) as unknown as WeeklyHours;
  for (const r of rows) {
    const key = DAY_NAMES[r.day.trim().toLowerCase()];
    if (!key) continue;
    week[key] = parseHoursText(r.hours);
  }
  return week;
}

export function hasAnyHours(hours: WeeklyHours): boolean {
  return DAY_KEYS.some((d) => (hours[d] ?? []).length > 0);
}

export function availabilityHours(a: Availability): WeeklyHours {
  return Object.fromEntries(DAY_KEYS.map((d) => [d, (a.hours[d] ?? []) as [string, string][]])) as WeeklyHours;
}

// --- iCalendar ---------------------------------------------------------------------------------------------------------

/** Non-recurring VEVENTs with DTSTART/DTEND (UTC, floating with TZID, or all-day). RRULE events are expanded for the next 90 days only by their first occurrence. */
export function parseIcsBusy(ics: string, window: Interval): Interval[] {
  const lines = unfoldIcs(ics);
  const out: Interval[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        const start = parseIcsDate(cur.DTSTART ?? '', cur['DTSTART;TZID'] ?? null);
        const end = parseIcsDate(cur.DTEND ?? '', cur['DTEND;TZID'] ?? null) ?? (start ? new Date(start.getTime() + 60 * 60_000) : null);
        const transparent = (cur.TRANSP ?? '').toUpperCase() === 'TRANSPARENT' || (cur.STATUS ?? '').toUpperCase() === 'CANCELLED';
        if (start && end && !transparent && start < window.end && end > window.start) out.push({ start, end });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [key, ...params] = rawKey.split(';');
    const tzid = params.find((p) => p.startsWith('TZID='))?.slice(5) ?? null;
    if (key === 'DTSTART' || key === 'DTEND') {
      cur[key] = value;
      if (tzid) cur[`${key};TZID`] = tzid;
    } else if (key) cur[key] = value;
  }
  return out;
}

function unfoldIcs(ics: string): string[] {
  const out: string[] = [];
  for (const raw of ics.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

function parseIcsDate(v: string, tzid: string | null): Date | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), h = Number(m[4] ?? '0'), mi = Number(m[5] ?? '0');
  if (m[7] === 'Z') return new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (tzid) {
    try { return fromZoned(y, mo, d, h, mi, tzid); } catch { /* unknown zone: treat as UTC */ }
  }
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
}

export interface IcsEventInput { uid: string; start: Date; end: Date; summary: string; description: string; organizerName: string; organizerEmail: string | null; attendeeName: string; attendeeEmail: string; location?: string; url?: string; cancelled?: boolean }

export function buildIcs(e: IcsEventInput): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sitewright//Scheduling//EN', `METHOD:${e.cancelled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(e.start)}`, `DTEND:${fmt(e.end)}`, `SUMMARY:${esc(e.summary)}`, `DESCRIPTION:${esc(e.description)}`,
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, `SEQUENCE:${e.cancelled ? 1 : 0}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), ...(e.url ? [`URL:${e.url}`] : []),
    e.organizerEmail ? `ORGANIZER;CN=${esc(e.organizerName)}:mailto:${e.organizerEmail}` : `ORGANIZER;CN=${esc(e.organizerName)}:mailto:noreply@invalid`,
    `ATTENDEE;CN=${esc(e.attendeeName)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e.attendeeEmail}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) { parts.push((i ? ' ' : '') + line.slice(i, i + (i ? 74 : 75))); i += i ? 74 : 75; }
  return parts.join('\r\n');
}

/** Human date/time in a zone: "Thursday 16 October, 15:00 (Europe/Lisbon)". */
export function formatInZone(d: Date, tz: string, locale = 'en-GB'): string {
  const f = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${f.format(d)} (${tz})`;
}

export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
