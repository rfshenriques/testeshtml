import { fromZoned, gapSeconds, nextSendSlot, validateSubject, zonedParts } from './timing';

describe('send timing (spec §11.6)', () => {
  const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
  it('only Tue–Thu, inside 08–11 or 14–16 local time', () => {
    // 2026-10-10 is a Saturday.
    const sat = new Date('2026-10-10T12:00:00Z');
    const slot = nextSendSlot(sat, 'MT', seq([0.5, 0]));
    const p = zonedParts(slot, 'Europe/Malta');
    expect(p.weekday).toBe(2); // Tuesday
    expect(p.hour).toBeGreaterThanOrEqual(8);
    expect(p.hour).toBeLessThan(11);
  });
  it('moves to the afternoon window when the morning one has passed, and to the next day after 16:00', () => {
    const tueNoon = fromZoned(2026, 10, 13, 12, 0, 'Europe/Malta');
    const p1 = zonedParts(nextSendSlot(tueNoon, 'MT', seq([0.5, 0])), 'Europe/Malta');
    expect(p1.day).toBe(13);
    expect(p1.hour).toBeGreaterThanOrEqual(14);
    expect(p1.hour).toBeLessThan(16);
    const tueEve = fromZoned(2026, 10, 13, 17, 0, 'Europe/Malta');
    const p2 = zonedParts(nextSendSlot(tueEve, 'MT', seq([0.5, 0])), 'Europe/Malta');
    expect(p2.day).toBe(14);
    expect(p2.hour).toBeLessThan(11);
  });
  it('respects the recipient zone (Lagos vs Sydney)', () => {
    const t = new Date('2026-10-13T00:00:00Z');
    const lagos = zonedParts(nextSendSlot(t, 'NG', seq([0.1, 0])), 'Africa/Lagos');
    const sydney = zonedParts(nextSendSlot(t, 'AU', seq([0.1, 0])), 'Australia/Sydney');
    expect(lagos.hour).toBeGreaterThanOrEqual(8);
    expect(sydney.hour).toBeGreaterThanOrEqual(8);
    expect([2, 3, 4]).toContain(sydney.weekday);
  });
  it('jitter stays within ±20 min and never leaves the window', () => {
    const mon = fromZoned(2026, 10, 12, 9, 0, 'Europe/Malta');
    for (const r of [0, 0.999]) {
      const p = zonedParts(nextSendSlot(mon, 'MT', seq([0.999, r])), 'Europe/Malta');
      expect(p.hour).toBeLessThan(11);
      expect(p.hour).toBeGreaterThanOrEqual(8);
    }
  });
  it('inter-send gap is 90–400 s', () => {
    expect(gapSeconds(() => 0)).toBe(90);
    expect(gapSeconds(() => 0.999)).toBeLessThanOrEqual(400);
  });
  it('subject lines: lowercase, 3–6 words, no gimmicks', () => {
    expect(validateSubject('dentist in valletta without a website').ok).toBe(true);
    expect(validateSubject('Free website!').ok).toBe(false);
    expect(validateSubject('a website for your clinic in sliema please').ok).toBe(false);
    expect(validateSubject('your website quote').ok).toBe(true);
    expect(validateSubject('Your website quote').ok).toBe(false);
  });
});
