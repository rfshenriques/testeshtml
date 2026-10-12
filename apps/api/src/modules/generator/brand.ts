import type { Brand } from '@sitewright/shared-types';

/**
 * Derive a brand palette from the lead's own photos: quantise pixels, score colours by
 * frequency × saturation, pick the strongest as primary, a hue-distant one as accent, and
 * the darkest frequent colour as the hero band. Pure maths; `sharp` only decodes images.
 */
export async function extractBrand(images: Buffer[]): Promise<Brand | null> {
  if (!images.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp');
  const bins = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (const img of images) {
    let data: Buffer;
    try {
      data = await sharp(img).resize(64, 64, { fit: 'inside' }).removeAlpha().raw().toBuffer();
    } catch {
      continue;
    }
    for (let i = 0; i + 2 < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = `${r >> 4}:${g >> 4}:${b >> 4}`;
      const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      bin.r += r; bin.g += g; bin.b += b; bin.n++;
      bins.set(key, bin);
    }
  }
  if (!bins.size) return null;
  const colours = [...bins.values()].map((c) => {
    const r = c.r / c.n, g = c.g / c.n, b = c.b / c.n;
    const { h, s, l } = rgbToHsl(r, g, b);
    return { hex: toHex(r, g, b), h, s, l, n: c.n };
  });
  const total = colours.reduce((a, c) => a + c.n, 0);
  const scored = colours
    .filter((c) => c.l > 0.12 && c.l < 0.85)
    .map((c) => ({ ...c, score: (c.n / total) * (0.25 + c.s) }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const primary = scored.find((c) => c.s > 0.2) ?? scored[0];
  const accent = scored.find((c) => hueDistance(c.h, primary.h) > 60 && c.s > 0.15) ?? scored.find((c) => c.hex !== primary.hex) ?? primary;
  const dark = [...colours].filter((c) => c.l < 0.3).sort((a, b) => b.n - a.n)[0];
  const swatches = scored.slice(0, 6).map((c) => c.hex);
  return { source: 'photos', primary: primary.hex, accent: accent.hex, heroBg: dark?.hex, swatches };
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function toHex(r: number, g: number, b: number) {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h, s, l };
}
