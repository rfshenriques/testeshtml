/** Send timing rules (spec §11.6): 08:00–11:00 and 14:00–16:00 recipient-local, Tue–Thu, ±20 min jitter, 90–400 s between sends per mailbox. */

export const COUNTRY_TZ: Record<string, string> = {
  MT: 'Europe/Malta', IE: 'Europe/Dublin', NL: 'Europe/Amsterdam', SE: 'Europe/Stockholm', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', NO: 'Europe/Oslo', FR: 'Europe/Paris', BE: 'Europe/Brussels', LU: 'Europe/Luxembourg', PT: 'Europe/Lisbon', DE: 'Europe/Berlin', IT: 'Europe/Rome', AT: 'Europe/Vienna', ES: 'Europe/Madrid', PL: 'Europe/Warsaw', GB: 'Europe/London', US: 'America/New_York', CA: 'America/Toronto', AU: 'Australia/Sydney', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos',
};
export const WINDOWS: [number, number][] = [[8, 11], [14, 16]];
export const SEND_DAYS = new Set([2, 3, 4]); // Tue, Wed, Thu
export const JITTER_MIN = 20;
export const MIN_GAP_S = 90;
export const MAX_GAP_S = 400;

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

export function zonedParts(date: Date, tz: string): ZonedParts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday };
}

/** UTC instant for a wall-clock time in `tz` (iterative offset correction, handles DST). */
export function fromZoned(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = Date.UTC(y, m - 1, d, h, min) - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Next allowed send instant at or after `earliest`, in the recipient's zone, jittered. `rand` in [0,1). */
export function nextSendSlot(earliest: Date, countryCode: string, rand: () => number = Math.random): Date {
  const tz = COUNTRY_TZ[countryCode] ?? 'Europe/Malta';
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const probe = new Date(earliest.getTime() + dayOffset * 86400_000);
    const p = zonedParts(probe, tz);
    if (!SEND_DAYS.has(p.weekday)) continue;
    for (const [start, end] of WINDOWS) {
      const windowStart = fromZoned(p.year, p.month, p.day, start, 0, tz);
      const windowEnd = fromZoned(p.year, p.month, p.day, end, 0, tz);
      const from = dayOffset === 0 ? Math.max(earliest.getTime(), windowStart.getTime()) : windowStart.getTime();
      if (from >= windowEnd.getTime()) continue;
      const t = from + rand() * (windowEnd.getTime() - from);
      const jitter = (rand() * 2 - 1) * JITTER_MIN * 60_000;
      return new Date(Math.min(Math.max(t + jitter, windowStart.getTime()), windowEnd.getTime() - 1));
    }
  }
  return new Date(earliest.getTime() + 14 * 86400_000);
}

export function gapSeconds(rand: () => number = Math.random): number {
  return Math.round(MIN_GAP_S + rand() * (MAX_GAP_S - MIN_GAP_S));
}

/** Subject lines: lowercase, 3–6 words, specific, no punctuation gimmicks (spec §11.6). */
const BANNED = /\b(free|guarantee[ds]?)\b|!|\$|[A-Z]{3,}/;
export function validateSubject(s: string): { ok: boolean; reason?: string } {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 6) return { ok: false, reason: `${words.length} words (need 3–6)` };
  if (s !== s.toLowerCase()) return { ok: false, reason: 'must be lowercase' };
  if (BANNED.test(s)) return { ok: false, reason: 'banned token (free/guarantee/!/$/caps)' };
  if (/[?!.]{2,}|…|🔥|⭐/.test(s)) return { ok: false, reason: 'punctuation gimmick' };
  return { ok: true };
}
