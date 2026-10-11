import { describe, expect, it } from 'vitest';
import { PLACE_TYPE_TIERS, VERTICALS, VERTICAL_TEMPLATE, placeTypeTier, WARMUP_SCHEDULE, MAILBOX_DAILY_CEILING } from './enums';

describe('enums', () => {
  it('maps every vertical to a template family', () => {
    for (const v of VERTICALS) expect(VERTICAL_TEMPLATE[v]).toBeTruthy();
  });
  it('classifies place type tiers', () => {
    expect(placeTypeTier('dentist')).toBe('A');
    expect(placeTypeTier('cafe')).toBe('B');
    expect(placeTypeTier('shoe_store')).toBe('C');
    expect(placeTypeTier('unknown_type')).toBeNull();
    expect(PLACE_TYPE_TIERS.A.length).toBeGreaterThan(5);
  });
  it('warmup never exceeds the 50/mailbox/day ceiling', () => {
    for (const cap of WARMUP_SCHEDULE) expect(cap).toBeLessThanOrEqual(MAILBOX_DAILY_CEILING);
  });
});
