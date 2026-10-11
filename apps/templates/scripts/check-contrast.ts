/**
 * Prints the WCAG contrast ratio of every text/background token pair in every
 * palette and exits non-zero if any is below AA (4.5:1).
 *
 *   pnpm --filter @sitewright/templates exec tsx scripts/check-contrast.ts
 */
import { CONTRAST_PAIRS, PALETTES, contrastRatio, type ColourScheme } from '../src/theme/tokens';
import type { TemplateFamily } from '@sitewright/shared-types';

let failures = 0;
for (const family of Object.keys(PALETTES) as TemplateFamily[]) {
  for (const scheme of Object.keys(PALETTES[family]) as ColourScheme[]) {
    const p = PALETTES[family][scheme];
    const cells = CONTRAST_PAIRS.map(([fg, bg]) => {
      const r = contrastRatio(p[fg], p[bg]);
      if (r < 4.5) failures++;
      return `${fg}/${bg}=${r.toFixed(2)}${r < 4.5 ? '!!' : ''}`;
    });
    console.log(`${family.padEnd(13)}${scheme}  ${cells.join('  ')}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} pair(s) below 4.5:1`);
  process.exit(1);
}
console.log('\nAll palettes meet WCAG AA (>= 4.5:1) for text pairs.');
