import { DEFAULT_PRICING } from '@sitewright/db';
import { PricingConfigSchema } from '@sitewright/shared-types';
import { computeQuote, selectTier } from './pricing';

const config = PricingConfigSchema.parse(DEFAULT_PRICING);
const base = { countryCode: 'MT', currency: 'EUR', primaryType: 'dentist', reviewCount: 120, score: 0.8, bottomQuartileScore: 0.4 };

describe('pricing engine (spec §10.1)', () => {
  it('Tier A with >50 reviews → premium; Tier C with few reviews → starter; default business', () => {
    expect(selectTier(base).tier).toBe('premium');
    expect(selectTier({ ...base, primaryType: 'shoe_store', reviewCount: 3 }).tier).toBe('starter');
    expect(selectTier({ ...base, primaryType: 'cafe', reviewCount: 30 }).tier).toBe('business');
  });
  it('never quotes premium to a bottom-quartile lead, but only once a distribution exists', () => {
    const s = selectTier({ ...base, score: 0.3 });
    expect(s.tier).toBe('business');
    expect(s.reasoning.join(' ')).toMatch(/bottom quartile/);
    expect(selectTier({ ...base, score: 0.3, bottomQuartileScore: null }).tier).toBe('premium');
  });
  it('applies country multipliers and currency, always in local currency', () => {
    const mt = computeQuote(config, base);
    expect(mt.tiers.starter.buildFee).toBe(690);
    expect(mt.tiers.starter.monthly).toBe(49);
    const ng = computeQuote(config, { ...base, countryCode: 'NG', currency: 'NGN' });
    expect(ng.currency).toBe('NGN');
    expect(ng.tiers.starter.buildFee).toBe(Math.round((690 * 0.3 * 1700) / 10) * 10);
    const gb = computeQuote(config, { ...base, countryCode: 'GB', currency: 'GBP' });
    expect(gb.tiers.business.buildFee).toBeLessThan(1450 * 1.1 * 0.86 + 10);
    expect(gb.tiers.business.buildFee).toBeGreaterThan(1450 * 1.1 * 0.86 - 10);
  });
  it('adds add-ons as transparent line items and respects an operator-forced tier', () => {
    const q = computeQuote(config, { ...base, addOns: ['seoLocal', 'photography', 'bogus'], tier: 'starter' });
    expect(q.recommendedTier).toBe('starter');
    expect(q.addOns).toEqual(['seoLocal', 'photography']);
    expect(q.tiers.starter.lineItems).toHaveLength(4);
    expect(q.tiers.starter.monthly).toBe(49 + 79);
    expect(q.tiers.starter.buildFee).toBe(690 + 290 + 450);
  });
  it('includes NFC tags per tier and prices extra tags by quantity', () => {
    const q = computeQuote(config, { ...base, addOns: ['nfcTagExtra', 'nfcTagExtra', 'nfcTagExtra'] });
    expect(q.tiers.starter.nfcTags).toBe(0);
    expect(q.tiers.business.nfcTags).toBe(1);
    expect(q.tiers.premium.nfcTags).toBe(2);
    expect(q.tiers.premium.lineItems.map((l) => l.label)).toEqual(expect.arrayContaining(['Google review + website NFC tags ×2 (included)', 'Extra NFC tags ×3']));
    expect(q.tiers.starter.lineItems.find((l) => l.label.includes('included'))).toBeUndefined();
    expect(q.tiers.business.buildFee).toBe(1450 + 45);
  });
});
