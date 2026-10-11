import { scoreLead, quality, ScoreInput } from './scoring';

const base: ScoreInput = { primaryType: 'dentist', websiteStatus: 'none', rating: 4.7, reviewCount: 120, priceLevel: null, businessStatus: 'OPERATIONAL', contact: 'named_valid', competitivePressureShare: 0.8 };

describe('scoreLead (spec §6.3)', () => {
  it('a Tier A business with no website, a named verified email and strong reviews scores near the top', () => {
    const s = scoreLead(base);
    expect(s.score).toBeGreaterThan(0.85);
    expect(s.contactability).toBe(1);
    expect(s.digitalGap).toBe(1);
    expect(s.qualitySignal).toBe(1);
    expect(s.weights.contactability).toBe(0.3);
  });
  it('ranks fixture leads in the expected order', () => {
    const named = scoreLead(base).score;
    const role = scoreLead({ ...base, contact: 'role_valid' }).score;
    const unverified = scoreLead({ ...base, contact: 'unverified' }).score;
    const phone = scoreLead({ ...base, contact: 'phone_only' }).score;
    const social = scoreLead({ ...base, websiteStatus: 'social_only' }).score;
    const httpOnly = scoreLead({ ...base, websiteStatus: 'http_only' }).score;
    const tierC = scoreLead({ ...base, primaryType: 'shoe_store' }).score;
    const lowQuality = scoreLead({ ...base, rating: 2.9, reviewCount: 2 }).score;
    expect(named).toBeGreaterThan(role);
    expect(role).toBeGreaterThan(unverified);
    expect(unverified).toBeGreaterThan(phone);
    expect(named).toBeGreaterThan(social);
    expect(social).toBeGreaterThan(httpOnly);
    expect(named).toBeGreaterThan(tierC);
    expect(named).toBeGreaterThan(lowQuality);
  });
  it('hard-excludes non-operational businesses (score 0, flagged) rather than penalising', () => {
    const s = scoreLead({ ...base, businessStatus: 'CLOSED_PERMANENTLY' });
    expect(s.hardExcluded).toBe(true);
    expect(s.score).toBe(0);
    expect(s.hardExcludeReason).toContain('CLOSED_PERMANENTLY');
  });
  it('quality signal slides between the thresholds', () => {
    expect(quality(4.5, 50)).toBe(1);
    expect(quality(2.9, 100)).toBe(0);
    expect(quality(4.5, 2)).toBe(0);
    const mid = quality(3.5, 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('stores a full breakdown with inputs', () => {
    const s = scoreLead(base);
    expect(s.inputs.tier).toBe('A');
    expect(s.inputs.contact).toBe('named_valid');
  });
});
