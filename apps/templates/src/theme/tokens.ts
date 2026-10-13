/** Design tokens live in @sitewright/shared-types (theme.ts) so the API and console can use them; re-exported here for the templates. */
export {
  PALETTES, TYPOGRAPHY, CONTRAST_PAIRS, BRAND_SCHEMES, COLOUR_SCHEME_LABEL, TYPOGRAPHY_LABEL, resolvePalette, derivePalette, deriveDarkPalette, deriveTintedPalette, ensureContrastOn,
  normaliseHex, rgbToHex, darken, lighten, mix, themeCss, hexToRgb, relativeLuminance, contrastRatio, contrastFailures,
} from '@sitewright/shared-types';
export type { ColourScheme, FixedScheme, BrandInput, Typography, Palette, TypePairing, ContrastFailure } from '@sitewright/shared-types';
