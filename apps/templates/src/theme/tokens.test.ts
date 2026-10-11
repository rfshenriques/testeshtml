import { describe, expect, it } from 'vitest';
import { TEMPLATE_FAMILIES } from '@sitewright/shared-types';
import { CONTRAST_PAIRS, PALETTES, TYPOGRAPHY, contrastFailures, contrastRatio, themeCss } from './tokens';

describe('design tokens', () => {
  it('ships three colour schemes for each of the six families and two typographic pairings', () => {
    for (const family of TEMPLATE_FAMILIES) expect(Object.keys(PALETTES[family]).sort()).toEqual(['a', 'b', 'c']);
    expect(Object.keys(TYPOGRAPHY).sort()).toEqual(['a', 'b']);
  });

  it('meets WCAG AA (>= 4.5:1) on every text/background pair of every palette', () => {
    expect(contrastFailures(4.5)).toEqual([]);
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(9);
  });

  it('computes the WCAG reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('uses system font stacks only (no web fonts) and emits custom properties on :root', () => {
    for (const t of Object.values(TYPOGRAPHY)) {
      for (const stack of [t.display, t.body, t.label]) expect(stack).not.toMatch(/url\(|https?:/);
    }
    const css = themeCss('fitness', 'b', 'a');
    expect(css.startsWith(':root{')).toBe(true);
    expect(css).toContain(`--primary:${PALETTES.fitness.b.primary}`);
    expect(css).toContain('--font-display:Georgia');
  });
});
