import { createHash } from 'node:crypto';
import type { Vertical } from '@sitewright/shared-types';

export interface SiteImage { url: string; alt: string; credit: string | null; placeholder: true }

/** Unsplash keywords per vertical (spec §9.4). Selection is deterministic, seeded on place_id, so rebuilds are stable. */
const KEYWORDS: Partial<Record<Vertical, string[]>> = {
  restaurant: ['restaurant interior', 'chef plating', 'dining table'], cafe: ['coffee shop', 'latte art', 'cafe interior'], bar: ['cocktail bar', 'bartender', 'bar interior'], bakery: ['bakery bread', 'pastry', 'baker'],
  salon: ['hair salon', 'hairdresser', 'salon interior'], spa: ['spa massage', 'wellness', 'spa towels'], gym: ['gym training', 'fitness class', 'weights'], dental: ['dental clinic', 'dentist chair', 'smile'], medical: ['medical clinic', 'doctor consultation', 'stethoscope'], veterinary: ['veterinarian', 'dog clinic', 'cat vet'],
  legal: ['law office', 'legal documents', 'handshake office'], accounting: ['accountant desk', 'calculator finance', 'office meeting'], realestate: ['house exterior', 'modern apartment', 'keys handover'], trades: ['plumber work', 'electrician tools', 'construction site'], automotive: ['car repair garage', 'mechanic', 'car service'],
  retail: ['boutique shop', 'retail display', 'shop interior'], education: ['classroom', 'tutoring', 'study desk'], events: ['event venue', 'wedding decor', 'party lights'], hospitality: ['hotel lobby', 'hotel room', 'reception'], professional_services: ['office workspace', 'consulting meeting', 'laptop desk'], other: ['small business', 'storefront', 'local shop'],
};

export function seededIndex(seed: string, n: number, salt = ''): number {
  const h = createHash('sha256').update(`${seed}:${salt}`).digest();
  return h.readUInt32BE(0) % Math.max(1, n);
}

export interface ImageSource { search(keyword: string, count: number): Promise<{ url: string; credit: string }[]> }

/** Unsplash API source (licensed stock). Keyless → returns [] and the templates render grey placeholders. */
export class UnsplashSource implements ImageSource {
  constructor(private readonly accessKey: string, private readonly fetchFn: typeof fetch = fetch) {}
  async search(keyword: string, count: number) {
    if (!this.accessKey) return [];
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=${count}&orientation=landscape&content_filter=high`;
    const res = await this.fetchFn(url, { headers: { Authorization: `Client-ID ${this.accessKey}`, 'Accept-Version': 'v1' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: { urls: { regular: string }; user: { name: string; links: { html: string } } }[] };
    return (data.results ?? []).map((r) => ({ url: r.urls.regular, credit: `Photo by ${r.user.name} on Unsplash (${r.user.links.html})` }));
  }
}

export async function selectImages(source: ImageSource, vertical: Vertical, seed: string, count = 3): Promise<SiteImage[]> {
  const keywords = KEYWORDS[vertical] ?? KEYWORDS.other!;
  const out: SiteImage[] = [];
  for (let i = 0; i < count; i++) {
    const kw = keywords[(seededIndex(seed, keywords.length, `kw${i}`) + i) % keywords.length];
    const results = await source.search(kw, 10).catch(() => []);
    if (!results.length) continue;
    const pick = results[seededIndex(seed, results.length, `img${i}`)];
    out.push({ url: pick.url, alt: `${kw} (indicative image)`, credit: pick.credit, placeholder: true });
  }
  return out;
}
