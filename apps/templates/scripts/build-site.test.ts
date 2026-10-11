/**
 * Builds every family fixture (plus one variant with photos, a map embed and
 * placeholders) through the real build pipeline and checks the non-negotiable
 * page requirements of spec §0.6, §9.2, §9.4 and §20.7.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TEMPLATE_FAMILIES, type SiteBuildInput, type TemplateFamily } from '@sitewright/shared-types';
import { buildSite } from './build-site';
import { sampleInput } from '../src/fixtures/sample-input';

interface Built { input: SiteBuildInput; html: string; buildHash: string; files: string[]; ms: number }

const BUILD_LIMIT_MS = 20_000;
const built = new Map<string, Built>();
let work = '';

function variantInput(): SiteBuildInput {
  const input = sampleInput('appointment', 'c', 'b');
  input.brief.phone = null;
  input.brief.internationalPhone = null;
  input.brief.reviewExcerpts = [];
  input.copy.placeholdersUsed = ['about.body', 'services[1].description'];
  input.images = [
    { url: 'https://images.example/hero.jpg', alt: 'Reception desk', credit: 'Example Photographer', placeholder: true },
    { url: 'https://images.example/room.jpg', alt: 'Treatment room', credit: null, placeholder: true },
  ];
  input.mockup.mapEmbedUrl = 'https://maps.example/embed?q=plymouth';
  input.mockup.previewSlug = 'variant-0000000000001';
  return input;
}

async function buildOne(key: string, input: SiteBuildInput): Promise<void> {
  const t0 = Date.now();
  const out = path.join(work, key);
  const result = await buildSite(input, out);
  const ms = Date.now() - t0;
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  built.set(key, { input, html, buildHash: result.buildHash, files: result.files, ms });
}

/** Runs jobs with the production parallelism (two builds at a time). */
async function pool(jobs: Array<() => Promise<void>>, size = 2): Promise<void> {
  const queue = [...jobs];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await job();
  }));
}

beforeAll(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'sitewright-templates-test-'));
  const jobs: Array<() => Promise<void>> = TEMPLATE_FAMILIES.map((f) => () => buildOne(f, sampleInput(f, 'a', 'a')));
  jobs.push(() => buildOne('hospitality-again', sampleInput('hospitality', 'a', 'a')));
  jobs.push(() => buildOne('variant', variantInput()));
  await pool(jobs, 2);
}, 180_000);

afterAll(async () => {
  if (work) await rm(work, { recursive: true, force: true });
});

function get(key: string): Built {
  const b = built.get(key);
  if (!b) throw new Error(`no build for ${key}`);
  return b;
}

/** Astro escapes text and attribute values; expectations built from raw input must match that. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Astro encodes `&` as `&#38;` inside attribute values. */
function escAttr(s: string): string {
  return s.replace(/&/g, '&#38;').replace(/"/g, '&#34;');
}

function imgs(html: string): string[] {
  return html.match(/<img\b[^>]*>/g) ?? [];
}

describe.each(TEMPLATE_FAMILIES as readonly TemplateFamily[])('%s template', (family) => {
  it('builds a single static page in under 20 seconds', () => {
    const b = get(family);
    expect(b.files).toEqual(['index.html']);
    expect(b.ms).toBeLessThan(BUILD_LIMIT_MS);
    expect(b.html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('is marked noindex and carries the mockup banner, footer notice, expiry and takedown link', () => {
    const { html, input } = get(family);
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('Unofficial concept mockup prepared by <a href="https://northline.example" rel="noopener">Northline Studio</a>.');
    expect(html).toContain(`Not affiliated with or endorsed by ${esc(input.mockup.businessName)}.`);
    expect(html).toContain("Images are indicative placeholders and will be replaced with the client's own photography.");
    expect(html).toContain('<time datetime="2026-11-10">10 November 2026</time>');
    expect(html).toContain(`<a href="${input.mockup.takedownUrl}" rel="nofollow">Remove this mockup</a>`);
    expect(html.indexOf('mockup-banner')).toBeLessThan(html.indexOf('<main'));
  });

  it('marks every image as a placeholder with alt text and explicit dimensions', () => {
    const list = imgs(get(family).html);
    expect(list.length).toBeGreaterThan(0);
    for (const tag of list) {
      expect(tag).toContain('data-placeholder="true"');
      expect(tag).toMatch(/\salt="[^"]+"/);
      expect(tag).toMatch(/\swidth="\d+"/);
      expect(tag).toMatch(/\sheight="\d+"/);
      expect(tag).toContain('src="data:image/svg+xml,');
    }
  });

  it('emits LocalBusiness JSON-LD, Open Graph tags and a click-to-call link from the brief', () => {
    const { html, input } = get(family);
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    expect(m).not.toBeNull();
    const ld = JSON.parse(m![1]!);
    expect(ld['@type']).toBe('LocalBusiness');
    expect(ld.name).toBe(input.brief.businessName);
    expect(ld.telephone).toBe(input.brief.internationalPhone);
    expect(ld.address.streetAddress).toBe(input.brief.address);
    expect(ld.openingHours).toHaveLength(7);
    expect(ld.geo).toEqual({ '@type': 'GeoCoordinates', latitude: input.brief.lat, longitude: input.brief.lng });
    expect(html).toContain(`<meta property="og:title" content="${escAttr(input.copy.meta.title)}">`);
    expect(html).toContain('<meta property="og:description" content="');
    expect(html).toContain('href="tel:+44');
    expect(html).toContain(`<title>${esc(input.copy.meta.title)}</title>`);
  });

  it('has a plain HTML form posting to the mockup endpoint with the demonstration note', () => {
    const { html, input } = get(family);
    expect(html).toContain(`<form class="form" method="post" action="${input.mockup.formEndpoint}"`);
    expect(html).toContain('This is a mockup — your message was recorded for demonstration');
    expect(html).toContain('<button class="btn btn-primary btn-lg" type="submit">');
  });

  it('renders the hours, a map placeholder (no embed URL), the rating and review excerpts', () => {
    const { html, input } = get(family);
    expect(html).toContain('<table class="hours-table"');
    expect(html).toContain('Map placeholder');
    expect(html).not.toContain('<iframe');
    expect(html).toContain(input.brief.rating!.toFixed(1));
    for (const excerpt of input.brief.reviewExcerpts) expect(html).toContain(esc(excerpt));
    expect(html).toContain(`class="wordmark wordmark--sm" href="#top" aria-label="${escAttr(input.brief.businessName)} — home">${esc(input.brief.businessName)}</a>`);
  });

  it('ships no JavaScript, no external stylesheets or fonts, and inlines its CSS', () => {
    const { html } = get(family);
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toEqual(['<script type="application/ld+json">']);
    expect(html).not.toMatch(/<link\b[^>]*rel="(stylesheet|preload|preconnect)"/);
    expect(html).not.toContain('fonts.googleapis');
    expect(html).not.toContain('@import');
    expect(html).toContain('<style>');
    expect(html).toContain(`data-template="${family}"`);
  });
});

describe('determinism and isolation', () => {
  it('produces byte-identical output and the same hash for the same input', () => {
    const a = get('hospitality');
    const b = get('hospitality-again');
    expect(a.html).toBe(b.html);
    expect(a.buildHash).toBe(b.buildHash);
    expect(a.buildHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different families', () => {
    const hashes = new Set(TEMPLATE_FAMILIES.map((f) => get(f).buildHash));
    expect(hashes.size).toBe(TEMPLATE_FAMILIES.length);
  });

  it('keeps every build under the 20 s budget while running two at a time', () => {
    for (const b of built.values()) expect(b.ms).toBeLessThan(BUILD_LIMIT_MS);
  });

  it('rejects invalid input before building', async () => {
    const bad = sampleInput('trades') as unknown as { template: string };
    bad.template = 'castle';
    await expect(buildSite(bad as unknown as SiteBuildInput, path.join(work, 'bad'))).rejects.toThrow();
  });
});

describe('variant: photos, map embed, placeholders, no phone', () => {
  it('uses the supplied image URLs and credits, still marked as placeholders', () => {
    const { html } = get('variant');
    const list = imgs(html);
    const real = list.filter((t) => t.includes('https://images.example/'));
    expect(real.length).toBe(2);
    expect(real[0]).toContain('alt="Reception desk"');
    expect(real[0]).toContain('data-placeholder="true"');
    expect(real[0]).toContain('loading="eager"');
    for (const tag of list) expect(tag).toContain('data-placeholder="true"');
    expect(html).toContain('Photo: Example Photographer');
  });

  it('embeds the provided map URL in a titled, lazy iframe', () => {
    const { html } = get('variant');
    expect(html).toContain('<iframe src="https://maps.example/embed?q=plymouth" title="Map showing the location of Harbour Dental Care" loading="lazy"');
    expect(html).not.toContain('Map placeholder');
  });

  it('renders neutral placeholders for fields named in placeholdersUsed and keeps the rest', () => {
    const { html, input } = get('variant');
    expect(html).not.toContain(input.copy.about.body);
    expect(html).toContain(input.copy.about.heading);
    expect(html).not.toContain(input.copy.services[1]!.description);
    expect(html).toContain(input.copy.services[0]!.description);
    expect((html.match(/class="ph"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('To be supplied by the business');
  });

  it('omits click-to-call and review excerpts when the brief has none, but keeps the rating summary', () => {
    const { html, input } = get('variant');
    expect(html).not.toContain('href="tel:');
    expect(html).not.toContain('<blockquote');
    expect(html).toContain(`${input.brief.rating!.toFixed(1)}`);
    expect(html).toContain('data-scheme="c"');
    expect(html).toContain('data-type="b"');
    expect(html).toContain('--font-label:ui-monospace');
  });
});
