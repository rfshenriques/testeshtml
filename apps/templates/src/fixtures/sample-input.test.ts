import { describe, expect, it } from 'vitest';
import { SiteBuildInputSchema, TEMPLATE_FAMILIES } from '@sitewright/shared-types';
import { SAMPLE_INPUTS, sampleInput } from './sample-input';
import { TEMPLATE_CATALOGUE } from '../templates/index';

const CLAIM_PATTERNS = [/\d+\s*years/i, /award/i, /certified/i, /licensed/i, /voted/i, /number one/i, /best in/i, /since (19|20)\d\d/i, /family-run/i, /[£$€]\s?\d/];

describe('sample inputs', () => {
  it('provides one valid SiteBuildInput per family', () => {
    for (const family of TEMPLATE_FAMILIES) {
      const parsed = SiteBuildInputSchema.safeParse(SAMPLE_INPUTS[family]);
      expect(parsed.success, `${family}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
      expect(SAMPLE_INPUTS[family].template).toBe(family);
    }
  });

  it('applies the requested scheme and typography on a deep copy', () => {
    const a = sampleInput('fitness', 'c', 'b');
    expect(a.colourScheme).toBe('c');
    expect(a.typography).toBe('b');
    a.brief.businessName = 'changed';
    expect(SAMPLE_INPUTS.fitness.brief.businessName).toBe('Ironworks Strength Club');
    expect(() => sampleInput('castle' as never)).toThrow();
  });

  it('contains no unverifiable claims in the copy (spec §9.3 deny-list)', () => {
    for (const family of TEMPLATE_FAMILIES) {
      const text = JSON.stringify(SAMPLE_INPUTS[family].copy);
      for (const re of CLAIM_PATTERNS) expect(text, `${family} matches ${re}`).not.toMatch(re);
    }
  });

  it('catalogues every family with its sections', () => {
    expect(TEMPLATE_CATALOGUE.map((t) => t.id)).toEqual([...TEMPLATE_FAMILIES]);
    for (const t of TEMPLATE_CATALOGUE) expect(t.sections.length).toBeGreaterThanOrEqual(5);
  });
});
