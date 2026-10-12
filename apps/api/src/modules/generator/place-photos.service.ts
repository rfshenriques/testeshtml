import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SiteImage } from '@sitewright/shared-types';
import { ENV, Env } from '../../shared/config/config.module';
import { CostLedgerService } from '../ops/cost-ledger.service';
import { QuotaService } from '../ops/quota.service';
import { STORAGE } from '../preview/preview.service';
import type { ObjectStorage } from '../preview/storage';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface PlacePhotoRef { name: string; authorAttributions?: { displayName?: string; uri?: string }[]; widthPx?: number; heightPx?: number }
export interface FetchedPhoto { image: SiteImage; bytes: Buffer }

export type PhotoFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Photos from the business's own Google listing (operator decision overriding spec §0.7): fetched via
 * the official Places Photo endpoint, stored under the preview prefix (so they expire and are deleted
 * with the mockup), shown with the listing's author attribution and marked as placeholders.
 */
@Injectable()
export class PlacePhotosService {
  private readonly log = new Logger(PlacePhotosService.name);
  fetchFn: PhotoFetcher = (url, init) => fetch(url, init);
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    private readonly costs: CostLedgerService,
    private readonly quotas: QuotaService,
    private readonly prisma: PrismaService,
  ) {}

  /** Photo refs (with attributions) from the latest unexpired details snapshot. */
  async photoRefs(placeId: string): Promise<PlacePhotoRef[]> {
    const snap = await this.prisma.placeSnapshot.findFirst({ where: { placeId, kind: 'details', expiresAt: { gt: new Date() } }, orderBy: { fetchedAt: 'desc' } });
    const raw = (snap?.raw as any) ?? null;
    const photos: any[] = raw?.photos ?? raw?.raw?.photos ?? [];
    return photos.filter((p) => p?.name).map((p) => ({ name: p.name, authorAttributions: p.authorAttributions ?? [], widthPx: p.widthPx, heightPx: p.heightPx }));
  }

  /** Download up to `max` photos and store them under previews/{slug}/photos/. Returns images with public URLs + bytes for palette extraction. */
  async fetchAndStore(leadId: string, placeId: string, slug: string, campaignId: string | null, max = this.env.PLACE_PHOTOS_MAX): Promise<FetchedPhoto[]> {
    if (!this.env.USE_PLACE_PHOTOS || !this.env.GOOGLE_MAPS_API_KEY) return [];
    const refs = (await this.photoRefs(placeId)).slice(0, max);
    const out: FetchedPhoto[] = [];
    for (const [i, ref] of refs.entries()) {
      try {
        await this.quotas.consume('google_places', this.env.GOOGLE_PLACES_DAILY_REQUEST_CAP, 1);
        const meta = await this.fetchFn(`https://places.googleapis.com/v1/${ref.name}/media?maxWidthPx=1600&skipHttpRedirect=true`, { headers: { 'X-Goog-Api-Key': this.env.GOOGLE_MAPS_API_KEY } });
        if (!meta.ok) throw new Error(`photo media ${meta.status}`);
        const { photoUri } = (await meta.json()) as { photoUri: string };
        const res = await this.fetchFn(photoUri);
        if (!res.ok) throw new Error(`photo download ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        const key = `previews/${slug}/photos/${i}.jpg`;
        await this.storage.put(key, bytes, 'image/jpeg');
        const author = ref.authorAttributions?.[0]?.displayName;
        out.push({
          bytes,
          image: { url: `${this.env.PREVIEW_HOST.replace(/\/$/, '')}/${slug}/photos/${i}.jpg`, alt: 'Photo from the business\'s Google listing (indicative)', credit: author ? `${author} via Google Maps` : 'Google Maps listing', placeholder: true, source: 'google_places' },
        });
        await this.costs.record({ category: 'images', units: 1, usd: 0.007, provider: 'google_places_photos', leadId, campaignId });
      } catch (e) {
        this.log.warn({ leadId, photo: ref.name, err: (e as Error).message }, 'place photo skipped');
      }
    }
    return out;
  }
}
