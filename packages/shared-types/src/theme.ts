/**
 * Design tokens for the template families (spec §9.2). Lives in shared-types so the API and the console
 * can show palettes and type pairings without building a page; the templates workspace re-exports it.
 *
 * Every family ships three fixed colour schemes (a, b, c), three palettes derived
 * from the lead's own material (brand, brand2, brand3) and shares five typographic
 * pairings (a–e). All values are emitted as CSS custom properties on :root by
 * `themeCss()`; components only ever reference the custom properties, never raw
 * colours, so a scheme swap is a pure token swap.
 *
 * Contrast guarantees (WCAG AA, ≥ 4.5:1) are enforced by apps/templates/scripts/check-contrast.ts
 * and apps/templates/src/theme/tokens.test.ts — do not edit a palette without re-running them.
 */
import type { ColourSchemeId, TemplateFamily, TypographyId } from './enums';

export type ColourScheme = ColourSchemeId;
export type FixedScheme = 'a' | 'b' | 'c';
export interface BrandInput { primary: string; accent: string; heroBg?: string | undefined }
export type Typography = TypographyId;

export interface Palette {
  /** Page background. */
  bg: string;
  /** Card / panel background. */
  surface: string;
  /** Body text on bg and surface. */
  text: string;
  /** Secondary text on bg and surface. */
  muted: string;
  /** Brand colour: buttons, links, wordmark. Must read as text on bg and surface. */
  primary: string;
  /** Text placed on a primary fill. */
  onPrimary: string;
  /** Secondary brand colour for highlights / secondary buttons. */
  accent: string;
  /** Text placed on an accent fill. */
  onAccent: string;
  /** Dark band used for the hero and the footer. */
  heroBg: string;
  /** Text placed on heroBg. */
  onHero: string;
  /** Hairlines and card borders (decorative, not text — no contrast requirement). */
  border: string;
}

export const PALETTES: Record<TemplateFamily, Record<FixedScheme, Palette>> = {
  // Warm, food-led: terracotta / forest, navy / brick, olive / amber.
  hospitality: {
    a: { bg: '#fbf6ee', surface: '#ffffff', text: '#2a1f14', muted: '#64513f', primary: '#8a3b12', onPrimary: '#ffffff', accent: '#2f5d3a', onAccent: '#ffffff', heroBg: '#2a1f14', onHero: '#fbf6ee', border: '#e5d9c8' },
    b: { bg: '#f4f6f8', surface: '#ffffff', text: '#141a21', muted: '#4a5663', primary: '#1d3b5a', onPrimary: '#ffffff', accent: '#a9402a', onAccent: '#ffffff', heroBg: '#141a21', onHero: '#f4f6f8', border: '#d8dee5' },
    c: { bg: '#f6f7f1', surface: '#ffffff', text: '#1f2419', muted: '#4f5743', primary: '#4a5a2a', onPrimary: '#ffffff', accent: '#86541a', onAccent: '#ffffff', heroBg: '#2b3320', onHero: '#f6f7f1', border: '#dde1d0' },
  },
  // Editorial, airy: blush / plum, sand / espresso, sage / charcoal.
  beauty: {
    a: { bg: '#faf5f3', surface: '#ffffff', text: '#2b1d1f', muted: '#6b5358', primary: '#8a3550', onPrimary: '#ffffff', accent: '#5b4a3f', onAccent: '#ffffff', heroBg: '#2b1d1f', onHero: '#faf5f3', border: '#ead9db' },
    b: { bg: '#f7f3ec', surface: '#ffffff', text: '#231c16', muted: '#5f554b', primary: '#6b4a2b', onPrimary: '#ffffff', accent: '#2d3a4a', onAccent: '#ffffff', heroBg: '#231c16', onHero: '#f7f3ec', border: '#e4dccf' },
    c: { bg: '#f3f6f3', surface: '#ffffff', text: '#1b2320', muted: '#51605a', primary: '#3c5a4b', onPrimary: '#ffffff', accent: '#8a4b2f', onAccent: '#ffffff', heroBg: '#1b2320', onHero: '#f3f6f3', border: '#d6e0da' },
  },
  // Calm, clinical: teal / raspberry, sky / navy, mint / aubergine.
  clinic: {
    a: { bg: '#f3f8f8', surface: '#ffffff', text: '#10282b', muted: '#3f5c64', primary: '#0e6166', onPrimary: '#ffffff', accent: '#a8325a', onAccent: '#ffffff', heroBg: '#0e6166', onHero: '#ffffff', border: '#cfe0e2' },
    b: { bg: '#f4f7fb', surface: '#ffffff', text: '#121c2b', muted: '#465468', primary: '#1f4e8c', onPrimary: '#ffffff', accent: '#1b7a6a', onAccent: '#ffffff', heroBg: '#121c2b', onHero: '#f4f7fb', border: '#d3dced' },
    c: { bg: '#f4f8f5', surface: '#ffffff', text: '#1a2622', muted: '#4a5c55', primary: '#2a6b4f', onPrimary: '#ffffff', accent: '#5e3570', onAccent: '#ffffff', heroBg: '#1a2622', onHero: '#f4f8f5', border: '#d2e2d8' },
  },
  // Bold, utilitarian: cobalt / safety orange, green / rust, amber / charcoal.
  trades: {
    a: { bg: '#f5f6f8', surface: '#ffffff', text: '#12161d', muted: '#464f5e', primary: '#0b3d91', onPrimary: '#ffffff', accent: '#a65200', onAccent: '#ffffff', heroBg: '#12161d', onHero: '#f5f6f8', border: '#d6dbe3' },
    b: { bg: '#f5f7f4', surface: '#ffffff', text: '#141b14', muted: '#485648', primary: '#1f5a2d', onPrimary: '#ffffff', accent: '#9a3b1d', onAccent: '#ffffff', heroBg: '#1f5a2d', onHero: '#ffffff', border: '#d4ddd3' },
    c: { bg: '#f6f5f2', surface: '#ffffff', text: '#1a1a1a', muted: '#525252', primary: '#874800', onPrimary: '#ffffff', accent: '#1a1a1a', onAccent: '#ffc857', heroBg: '#1a1a1a', onHero: '#f6f5f2', border: '#ddd9d0' },
  },
  // Industrial, dark bands: graphite / red, steel / yellow, slate / electric blue.
  automotive: {
    a: { bg: '#f4f4f5', surface: '#ffffff', text: '#151618', muted: '#4b4e55', primary: '#b3121b', onPrimary: '#ffffff', accent: '#151618', onAccent: '#ffffff', heroBg: '#151618', onHero: '#f4f4f5', border: '#d9dadd' },
    b: { bg: '#f3f4f6', surface: '#ffffff', text: '#14181e', muted: '#4a525c', primary: '#1e3a5f', onPrimary: '#ffffff', accent: '#8a5a00', onAccent: '#ffffff', heroBg: '#14181e', onHero: '#f3f4f6', border: '#d5dae1' },
    c: { bg: '#f2f5f7', surface: '#ffffff', text: '#101b24', muted: '#44525e', primary: '#0f5c8f', onPrimary: '#ffffff', accent: '#2a2f36', onAccent: '#ffffff', heroBg: '#101b24', onHero: '#f2f5f7', border: '#d0dae2' },
  },
  // Conservative: navy / brass, forest / oxblood, burgundy / steel.
  professional: {
    a: { bg: '#f7f8fa', surface: '#ffffff', text: '#121a2b', muted: '#475163', primary: '#1b2f5b', onPrimary: '#ffffff', accent: '#7d5f16', onAccent: '#ffffff', heroBg: '#121a2b', onHero: '#f7f8fa', border: '#d9dde5' },
    b: { bg: '#f6f6f4', surface: '#ffffff', text: '#1c1c1a', muted: '#54544e', primary: '#2e4a3f', onPrimary: '#ffffff', accent: '#6a3a2a', onAccent: '#ffffff', heroBg: '#1c1c1a', onHero: '#f6f6f4', border: '#dcdcd5' },
    c: { bg: '#faf7f5', surface: '#ffffff', text: '#241418', muted: '#5e4b55', primary: '#6e1f33', onPrimary: '#ffffff', accent: '#2a4a6a', onAccent: '#ffffff', heroBg: '#6e1f33', onHero: '#ffffff', border: '#e6d9dc' },
  },
  // Clean, photographic: ink / copper, deep green / stone, midnight / gold.
  property: {
    a: { bg: '#f7f7f5', surface: '#ffffff', text: '#171a1c', muted: '#4d5357', primary: '#1f2a33', onPrimary: '#ffffff', accent: '#9a5a2a', onAccent: '#ffffff', heroBg: '#1f2a33', onHero: '#f7f7f5', border: '#dadcd9' },
    b: { bg: '#f5f7f4', surface: '#ffffff', text: '#162019', muted: '#4a5a4f', primary: '#1f4d3a', onPrimary: '#ffffff', accent: '#6b5a44', onAccent: '#ffffff', heroBg: '#162019', onHero: '#f5f7f4', border: '#d5ded7' },
    c: { bg: '#f5f6fa', surface: '#ffffff', text: '#141628', muted: '#4c4f66', primary: '#2b2f6b', onPrimary: '#ffffff', accent: '#8a6a12', onAccent: '#ffffff', heroBg: '#141628', onHero: '#f5f6fa', border: '#d8daea' },
  },
  // Friendly, rounded: indigo / marigold, teal / coral, plum / leaf.
  education: {
    a: { bg: '#f6f6fb', surface: '#ffffff', text: '#1a1b3a', muted: '#4f5170', primary: '#3b3f9e', onPrimary: '#ffffff', accent: '#8a5a00', onAccent: '#ffffff', heroBg: '#1a1b3a', onHero: '#f6f6fb', border: '#dcdcf0' },
    b: { bg: '#f3f8f8', surface: '#ffffff', text: '#12282a', muted: '#415d60', primary: '#0f6b70', onPrimary: '#ffffff', accent: '#b33a2b', onAccent: '#ffffff', heroBg: '#12282a', onHero: '#f3f8f8', border: '#cfe2e3' },
    c: { bg: '#faf5fa', surface: '#ffffff', text: '#2a1830', muted: '#62506a', primary: '#6a2d7a', onPrimary: '#ffffff', accent: '#2f6b3a', onAccent: '#ffffff', heroBg: '#2a1830', onHero: '#faf5fa', border: '#e8d8ea' },
  },
  // Shop-like: plum / cherry, rust / teal, green / charcoal.
  retail: {
    a: { bg: '#faf6fb', surface: '#ffffff', text: '#22162a', muted: '#5c4b66', primary: '#5b2a86', onPrimary: '#ffffff', accent: '#a82e36', onAccent: '#ffffff', heroBg: '#22162a', onHero: '#faf6fb', border: '#e3d7e8' },
    b: { bg: '#fffaf0', surface: '#ffffff', text: '#2a2416', muted: '#645a41', primary: '#9a421c', onPrimary: '#ffffff', accent: '#1f5f6a', onAccent: '#ffffff', heroBg: '#2a2416', onHero: '#fffaf0', border: '#ecdfc6' },
    c: { bg: '#f3f8f6', surface: '#ffffff', text: '#152420', muted: '#485d55', primary: '#146450', onPrimary: '#ffffff', accent: '#2b2b2b', onAccent: '#ffffff', heroBg: '#152420', onHero: '#f3f8f6', border: '#d2e0db' },
  },
  // High energy: crimson / lime-on-black, blue / orange, olive / rust.
  fitness: {
    a: { bg: '#f4f5f7', surface: '#ffffff', text: '#111318', muted: '#474d5c', primary: '#a8112a', onPrimary: '#ffffff', accent: '#111318', onAccent: '#d9ff3f', heroBg: '#111318', onHero: '#f4f5f7', border: '#d7dae0' },
    b: { bg: '#f3f7fa', surface: '#ffffff', text: '#0f1f2b', muted: '#415466', primary: '#0b5c8e', onPrimary: '#ffffff', accent: '#a8440a', onAccent: '#ffffff', heroBg: '#0b5c8e', onHero: '#ffffff', border: '#d3dfe8' },
    c: { bg: '#f7f5f0', surface: '#ffffff', text: '#1e1b16', muted: '#565046', primary: '#4a5a2a', onPrimary: '#ffffff', accent: '#8d3b1e', onAccent: '#ffffff', heroBg: '#1e1b16', onHero: '#f7f5f0', border: '#e0dbd0' },
  },
};

export interface TypePairing {
  name: string;
  /** Headlines and the generated wordmark (spec §9.4). */
  display: string;
  body: string;
  /** Eyebrow labels, badges and small caps. */
  label: string;
  displayWeight: number;
  displayTracking: string;
  displayTransform: 'none' | 'uppercase';
  labelTransform: 'none' | 'uppercase';
}

/** Self-hosted system stacks only: no external font requests, works offline (spec §9.2 Lighthouse ≥ 95). */
export const TYPOGRAPHY: Record<Typography, TypePairing> = {
  a: {
    name: 'Editorial',
    display: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif",
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    label: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    displayWeight: 700,
    displayTracking: '-0.01em',
    displayTransform: 'none',
    labelTransform: 'uppercase',
  },
  b: {
    name: 'Modern',
    display: "'Avenir Next', 'Helvetica Neue', Helvetica, 'Segoe UI', Arial, system-ui, sans-serif",
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    label: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    displayWeight: 800,
    displayTracking: '-0.03em',
    displayTransform: 'none',
    labelTransform: 'uppercase',
  },
  c: {
    name: 'Geometric',
    display: "'Avenir Next Rounded', 'Avenir Next', Futura, 'Century Gothic', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    body: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif",
    label: "'Avenir Next', 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif",
    displayWeight: 700,
    displayTracking: '-0.02em',
    displayTransform: 'none',
    labelTransform: 'none',
  },
  d: {
    name: 'Classic',
    display: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'Times New Roman', serif",
    body: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif",
    label: "Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    displayWeight: 600,
    displayTracking: '0',
    displayTransform: 'none',
    labelTransform: 'uppercase',
  },
  e: {
    name: 'Technical',
    display: "'Helvetica Neue', 'Arial Narrow', 'Roboto Condensed', Impact, 'Segoe UI', Arial, system-ui, sans-serif",
    body: "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif",
    label: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    displayWeight: 800,
    displayTracking: '-0.02em',
    displayTransform: 'uppercase',
    labelTransform: 'uppercase',
  },
};

/** Text/background pairs that must meet WCAG AA (4.5:1) in every palette. */
export const CONTRAST_PAIRS: ReadonlyArray<[fg: keyof Palette, bg: keyof Palette]> = [
  ['text', 'bg'], ['text', 'surface'],
  ['muted', 'bg'], ['muted', 'surface'],
  ['primary', 'bg'], ['primary', 'surface'],
  ['onPrimary', 'primary'],
  ['onAccent', 'accent'],
  ['onHero', 'heroBg'],
];

/**
 * Palette for a family/scheme. The brand schemes derive the palette from the lead's own colours (listing
 * photos / logo), adjusted until every contrast pair meets AA:
 *   brand  — light page, their primary and accent on the family's neutral background;
 *   brand2 — dark hero and footer from their darkest tone, their accent on it, deeper primary;
 *   brand3 — the whole page tinted with their primary (background and surfaces carry a wash of it).
 */
export function resolvePalette(family: TemplateFamily, scheme: ColourScheme, brand?: BrandInput | null): Palette {
  if (scheme === 'a' || scheme === 'b' || scheme === 'c') return PALETTES[family][scheme];
  const base = PALETTES[family].a;
  if (!brand) return base;
  if (scheme === 'brand2') return deriveDarkPalette(base, brand);
  if (scheme === 'brand3') return deriveTintedPalette(base, brand);
  return derivePalette(base, brand);
}

export function derivePalette(base: Palette, brand: BrandInput): Palette {
  const primary = ensureContrastOn(brand.primary, base.bg, 4.5);
  const accent = ensureContrastOn(brand.accent, base.bg, 4.5);
  const heroBg = brand.heroBg ? ensureContrastOn(brand.heroBg, '#ffffff', 4.5) : darken(primary, 0.55);
  const p: Palette = {
    ...base,
    primary,
    onPrimary: contrastRatio('#ffffff', primary) >= 4.5 ? '#ffffff' : '#111111',
    accent,
    onAccent: contrastRatio('#ffffff', accent) >= 4.5 ? '#ffffff' : '#111111',
    heroBg,
    onHero: contrastRatio(base.bg, heroBg) >= 4.5 ? base.bg : contrastRatio('#ffffff', heroBg) >= 4.5 ? '#ffffff' : '#111111',
    border: mix(primary, base.bg, 0.8),
  };
  return p;
}

/** brand2: hero/footer in their darkest tone (or a deep shade of the primary), accent kept vivid, primary deepened for text. */
export function deriveDarkPalette(base: Palette, brand: BrandInput): Palette {
  const light = derivePalette(base, brand);
  const heroSeed = brand.heroBg ?? darken(brand.primary, 0.7);
  const heroBg = ensureContrastOn(mix(heroSeed, '#000000', 0.35), '#ffffff', 7);
  const primary = ensureContrastOn(darken(brand.primary, 0.15), base.bg, 4.5);
  return {
    ...light,
    primary,
    onPrimary: contrastRatio('#ffffff', primary) >= 4.5 ? '#ffffff' : '#111111',
    heroBg,
    onHero: '#ffffff',
    border: mix(primary, base.bg, 0.78),
  };
}

/** brand3: background and surfaces washed with their primary; text tones pulled towards the same hue. */
export function deriveTintedPalette(base: Palette, brand: BrandInput): Palette {
  const bg = mix(brand.primary, '#ffffff', 0.92);
  const surface = mix(brand.primary, '#ffffff', 0.97);
  const text = ensureContrastOn(mix(brand.primary, '#111111', 0.8), bg, 7);
  const muted = ensureContrastOn(mix(brand.primary, '#444444', 0.65), bg, 4.5);
  const primary = ensureContrastOn(brand.primary, bg, 4.5);
  const accent = ensureContrastOn(brand.accent, bg, 4.5);
  const heroBg = ensureContrastOn(brand.heroBg ?? darken(brand.primary, 0.6), '#ffffff', 4.5);
  return {
    bg, surface, text, muted, primary,
    onPrimary: contrastRatio('#ffffff', primary) >= 4.5 ? '#ffffff' : '#111111',
    accent,
    onAccent: contrastRatio('#ffffff', accent) >= 4.5 ? '#ffffff' : '#111111',
    heroBg,
    onHero: contrastRatio(bg, heroBg) >= 4.5 ? bg : '#ffffff',
    border: mix(primary, bg, 0.75),
  };
}

/** Darken (or, for very dark inputs, lighten) a colour until it reads on `bg` at the requested ratio. */
export function ensureContrastOn(hex: string, bg: string, min: number): string {
  let c = normaliseHex(hex);
  if (contrastRatio(c, bg) >= min) return c;
  const bgLum = relativeLuminance(bg);
  for (let i = 0; i < 40 && contrastRatio(c, bg) < min; i++) c = bgLum > 0.5 ? darken(c, 0.08) : lighten(c, 0.08);
  return c;
}

export function normaliseHex(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r, g, b);
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
export function mix(a: string, b: string, weightOfB: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * weightOfB, g1 + (g2 - g1) * weightOfB, b1 + (b2 - b1) * weightOfB);
}

export function themeCss(family: TemplateFamily, scheme: ColourScheme, typography: Typography, brand?: BrandInput | null): string {
  const p = resolvePalette(family, scheme, brand);
  const t = TYPOGRAPHY[typography];
  const vars = [
    `--bg:${p.bg}`, `--surface:${p.surface}`, `--text:${p.text}`, `--muted:${p.muted}`,
    `--primary:${p.primary}`, `--on-primary:${p.onPrimary}`, `--accent:${p.accent}`, `--on-accent:${p.onAccent}`,
    `--hero-bg:${p.heroBg}`, `--on-hero:${p.onHero}`, `--border:${p.border}`,
    `--font-display:${t.display}`, `--font-body:${t.body}`, `--font-label:${t.label}`,
    `--display-weight:${t.displayWeight}`, `--display-tracking:${t.displayTracking}`,
    `--display-transform:${t.displayTransform}`, `--label-transform:${t.labelTransform}`,
  ];
  return `:root{${vars.join(';')}}`;
}

// --- WCAG contrast maths -----------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastFailure { family: TemplateFamily; scheme: ColourScheme; fg: keyof Palette; bg: keyof Palette; ratio: number }

/** Returns every token pair below 4.5:1 across all palettes (empty array = all AA). */
export function contrastFailures(min = 4.5): ContrastFailure[] {
  const out: ContrastFailure[] = [];
  for (const family of Object.keys(PALETTES) as TemplateFamily[]) {
    for (const scheme of Object.keys(PALETTES[family]) as FixedScheme[]) {
      const p = PALETTES[family][scheme];
      for (const [fg, bg] of CONTRAST_PAIRS) {
        const ratio = contrastRatio(p[fg], p[bg]);
        if (ratio < min) out.push({ family, scheme, fg, bg, ratio });
      }
    }
  }
  return out;
}
