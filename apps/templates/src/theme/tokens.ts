/**
 * Design tokens for the six template families (spec §9.2).
 *
 * Every family ships three colour schemes (a, b, c) and shares two typographic
 * pairings (a, b). All values are emitted as CSS custom properties on :root by
 * `themeCss()`; components only ever reference the custom properties, never raw
 * colours, so a scheme swap is a pure token swap.
 *
 * Contrast guarantees (WCAG AA, ≥ 4.5:1) are enforced by scripts/check-contrast.ts
 * and the tokens test — do not edit a palette without re-running them.
 */
import type { TemplateFamily } from '@sitewright/shared-types';

export type ColourScheme = 'a' | 'b' | 'c';
export type Typography = 'a' | 'b';

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

export const PALETTES: Record<TemplateFamily, Record<ColourScheme, Palette>> = {
  hospitality: {
    a: { bg: '#fbf6ee', surface: '#ffffff', text: '#2a1f14', muted: '#64513f', primary: '#8a3b12', onPrimary: '#ffffff', accent: '#2f5d3a', onAccent: '#ffffff', heroBg: '#2a1f14', onHero: '#fbf6ee', border: '#e5d9c8' },
    b: { bg: '#f4f6f8', surface: '#ffffff', text: '#141a21', muted: '#4a5663', primary: '#1d3b5a', onPrimary: '#ffffff', accent: '#a9402a', onAccent: '#ffffff', heroBg: '#141a21', onHero: '#f4f6f8', border: '#d8dee5' },
    c: { bg: '#f6f7f1', surface: '#ffffff', text: '#1f2419', muted: '#4f5743', primary: '#4a5a2a', onPrimary: '#ffffff', accent: '#86541a', onAccent: '#ffffff', heroBg: '#2b3320', onHero: '#f6f7f1', border: '#dde1d0' },
  },
  appointment: {
    a: { bg: '#f3f8f8', surface: '#ffffff', text: '#10282b', muted: '#3f5c64', primary: '#0e6166', onPrimary: '#ffffff', accent: '#a8325a', onAccent: '#ffffff', heroBg: '#0e6166', onHero: '#ffffff', border: '#cfe0e2' },
    b: { bg: '#fbf5f6', surface: '#ffffff', text: '#2b1a1f', muted: '#654a53', primary: '#8b2f4a', onPrimary: '#ffffff', accent: '#3a4e7a', onAccent: '#ffffff', heroBg: '#2b1a1f', onHero: '#fbf5f6', border: '#ead8dc' },
    c: { bg: '#f4f7f3', surface: '#ffffff', text: '#1d2a1f', muted: '#4c5e4a', primary: '#2f5e45', onPrimary: '#ffffff', accent: '#764722', onAccent: '#ffffff', heroBg: '#1d2a1f', onHero: '#f4f7f3', border: '#d7e0d4' },
  },
  trades: {
    a: { bg: '#f5f6f8', surface: '#ffffff', text: '#12161d', muted: '#464f5e', primary: '#0b3d91', onPrimary: '#ffffff', accent: '#a65200', onAccent: '#ffffff', heroBg: '#12161d', onHero: '#f5f6f8', border: '#d6dbe3' },
    b: { bg: '#f5f7f4', surface: '#ffffff', text: '#141b14', muted: '#485648', primary: '#1f5a2d', onPrimary: '#ffffff', accent: '#9a3b1d', onAccent: '#ffffff', heroBg: '#1f5a2d', onHero: '#ffffff', border: '#d4ddd3' },
    c: { bg: '#f6f5f2', surface: '#ffffff', text: '#1a1a1a', muted: '#525252', primary: '#874800', onPrimary: '#ffffff', accent: '#1a1a1a', onAccent: '#ffc857', heroBg: '#1a1a1a', onHero: '#f6f5f2', border: '#ddd9d0' },
  },
  professional: {
    a: { bg: '#f7f8fa', surface: '#ffffff', text: '#121a2b', muted: '#475163', primary: '#1b2f5b', onPrimary: '#ffffff', accent: '#7d5f16', onAccent: '#ffffff', heroBg: '#121a2b', onHero: '#f7f8fa', border: '#d9dde5' },
    b: { bg: '#f6f6f4', surface: '#ffffff', text: '#1c1c1a', muted: '#54544e', primary: '#2e4a3f', onPrimary: '#ffffff', accent: '#6a3a2a', onAccent: '#ffffff', heroBg: '#1c1c1a', onHero: '#f6f6f4', border: '#dcdcd5' },
    c: { bg: '#faf7f5', surface: '#ffffff', text: '#241418', muted: '#5e4b55', primary: '#6e1f33', onPrimary: '#ffffff', accent: '#2a4a6a', onAccent: '#ffffff', heroBg: '#6e1f33', onHero: '#ffffff', border: '#e6d9dc' },
  },
  retail: {
    a: { bg: '#faf6fb', surface: '#ffffff', text: '#22162a', muted: '#5c4b66', primary: '#5b2a86', onPrimary: '#ffffff', accent: '#a82e36', onAccent: '#ffffff', heroBg: '#22162a', onHero: '#faf6fb', border: '#e3d7e8' },
    b: { bg: '#fffaf0', surface: '#ffffff', text: '#2a2416', muted: '#645a41', primary: '#9a421c', onPrimary: '#ffffff', accent: '#1f5f6a', onAccent: '#ffffff', heroBg: '#2a2416', onHero: '#fffaf0', border: '#ecdfc6' },
    c: { bg: '#f3f8f6', surface: '#ffffff', text: '#152420', muted: '#485d55', primary: '#146450', onPrimary: '#ffffff', accent: '#2b2b2b', onAccent: '#ffffff', heroBg: '#152420', onHero: '#f3f8f6', border: '#d2e0db' },
  },
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

export function themeCss(family: TemplateFamily, scheme: ColourScheme, typography: Typography): string {
  const p = PALETTES[family][scheme];
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
    for (const scheme of Object.keys(PALETTES[family]) as ColourScheme[]) {
      const p = PALETTES[family][scheme];
      for (const [fg, bg] of CONTRAST_PAIRS) {
        const ratio = contrastRatio(p[fg], p[bg]);
        if (ratio < min) out.push({ family, scheme, fg, bg, ratio });
      }
    }
  }
  return out;
}
