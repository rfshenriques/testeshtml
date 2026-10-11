import { Inject, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';
import { CostLedgerService } from '../ops/cost-ledger.service';
import { QuotaService } from '../ops/quota.service';

export const PLACES_CLIENT = Symbol('PLACES_CLIENT');

/** Subset of @sitewright/places-client used by the API (see docs/PACKAGES.md). */
export interface PlacesSearchResult {
  id: string; displayName: string | null; formattedAddress: string | null; location: { lat: number; lng: number } | null;
  primaryType: string | null; types: string[]; websiteUri: string | null; businessStatus: string | null;
  rating: number | null; userRatingCount: number | null; raw: unknown;
}
export interface PlaceDetails extends PlacesSearchResult {
  nationalPhoneNumber: string | null; internationalPhoneNumber: string | null;
  regularOpeningHours: { weekdayDescriptions: string[] } | null; priceLevel: number | null;
  editorialSummary: string | null; reviews: { text: string; rating: number | null }[]; photos: { name: string }[];
  addressComponents: { longText: string; shortText: string; types: string[] }[];
}
export interface PlacesApi {
  searchNearby(input: { lat: number; lng: number; radiusM: number; includedTypes: string[]; maxResultCount?: number; languageCode?: string; regionCode?: string }): Promise<PlacesSearchResult[]>;
  details(placeId: string, opts?: { languageCode?: string }): Promise<PlaceDetails>;
}

/** Cost context threaded through AsyncLocalStorage-free code: the worker sets it before calling the client. */
export interface PlacesCostContext { campaignId: string | null; leadId?: string | null }
export const placesCostContext: { current: PlacesCostContext } = { current: { campaignId: null } };

export const PLACES_PRICING = { searchUsd: 0.032, detailsUsd: 0.02 }; // indicative, spec §0.4; verify at build time

export const placesClientProvider: Provider = {
  provide: PLACES_CLIENT,
  inject: [ENV, REDIS, CostLedgerService, QuotaService],
  useFactory: (env: Env, redis: Redis, costs: CostLedgerService, quotas: QuotaService): PlacesApi => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@sitewright/places-client');
    const client = new pkg.PlacesClient({
      apiKey: env.GOOGLE_MAPS_API_KEY,
      pricing: PLACES_PRICING,
      cache: {
        get: (k: string) => redis.get(`places:${k}`),
        set: (k: string, v: string, ttl: number) => redis.set(`places:${k}`, v, 'EX', ttl).then(() => undefined),
      },
      beforeRequest: () => quotas.consume('google_places', env.GOOGLE_PLACES_DAILY_REQUEST_CAP, 1).then(() => undefined),
      onCost: (e: { kind: 'search' | 'details'; units: number; usd: number; cached: boolean }) =>
        costs.record({
          category: e.kind === 'search' ? 'places_search' : 'places_details',
          units: e.units, usd: e.usd, provider: 'google_places',
          campaignId: placesCostContext.current.campaignId, leadId: placesCostContext.current.leadId ?? null,
          meta: { cached: e.cached },
        }),
    });
    return client as PlacesApi;
  },
};

export const InjectPlaces = () => Inject(PLACES_CLIENT);
