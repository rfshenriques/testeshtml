import { extractBrand } from './brand';

async function solid(r: number, g: number, b: number, w = 40, h = 40) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp');
  return sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

describe('extractBrand', () => {
  it('finds the dominant saturated colour and a hue-distant accent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp');
    const left = await solid(200, 30, 40, 60, 40); // red
    const right = await solid(20, 60, 180, 30, 40); // blue
    const composite = await sharp({ create: { width: 90, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 60, top: 0 }]).png().toBuffer();
    const brand = await extractBrand([composite]);
    expect(brand).toBeTruthy();
    expect(brand!.source).toBe('photos');
    expect(brand!.primary.toLowerCase()).toMatch(/^#c/); // reddish
    expect(brand!.accent).not.toBe(brand!.primary);
    expect(brand!.swatches.length).toBeGreaterThan(0);
  });
  it('returns null without usable images', async () => {
    expect(await extractBrand([])).toBeNull();
    expect(await extractBrand([Buffer.from('not an image')])).toBeNull();
  });
});
