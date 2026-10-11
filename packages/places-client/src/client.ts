import { createHash } from 'node:crypto';
import { PlacesError } from './errors';
import { normaliseDetails, normaliseSearchResult } from './normalise';
import type {
  PlaceDetails,
  PlacesCallKind,
  PlacesClientOptions,
  PlacesSearchResult,
  SearchNearbyInput,
  SearchTextInput,
} from './types';

export const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

const SEARCH_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'primaryType',
  'types',
  'websiteUri',
  'businessStatus',
  'rating',
  'userRatingCount',
];
const DETAILS_EXTRA_FIELDS = [
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'regularOpeningHours',
  'priceLevel',
  'editorialSummary',
  'reviews',
  'photos',
  'addressComponents',
];

/** Field mask for search responses (spec §6.1). Search responses wrap results in `places[]`, hence the prefix. */
export const SEARCH_FIELD_MASK: string = SEARCH_FIELDS.map((f) => `places.${f}`).join(',');
/** Field mask for Place Details GET (no prefix). */
export const DETAILS_FIELD_MASK: string = [...SEARCH_FIELDS, ...DETAILS_EXTRA_FIELDS].join(',');
/** Text search additionally needs `nextPageToken` in the mask to receive pagination tokens. */
export const TEXT_SEARCH_FIELD_MASK: string = `${SEARCH_FIELD_MASK},nextPageToken`;

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const BACKOFF_BASE_MS = 500;
const MAX_RESULTS_PER_REQUEST = 20;
const MAX_RADIUS_M = 50000;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Deterministic JSON: object keys sorted recursively, undefined values dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** Cache key = sha256(kind + canonical JSON of the request). */
export function cacheKey(kind: string, request: unknown): string {
  return createHash('sha256').update(kind).update(canonicalJson(request)).digest('hex');
}

interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  fieldMask: string;
  body?: unknown;
}

export class PlacesClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: PlacesClientOptions['cache'];
  private readonly cacheTtlSeconds: number;
  private readonly onCost: PlacesClientOptions['onCost'];
  private readonly beforeRequest: PlacesClientOptions['beforeRequest'];
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pricing: { searchUsd: number; detailsUsd: number };

  constructor(opts: PlacesClientOptions) {
    if (!opts.apiKey) throw new Error('PlacesClient: apiKey is required');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') throw new Error('PlacesClient: no fetch implementation available');
    this.cache = opts.cache;
    this.cacheTtlSeconds = opts.cacheTtlSeconds ?? 86400;
    this.onCost = opts.onCost;
    this.beforeRequest = opts.beforeRequest;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 5);
    this.sleep = opts.sleep ?? defaultSleep;
    this.pricing = opts.pricing ?? { searchUsd: 0.032, detailsUsd: 0.02 };
  }

  async searchNearby(input: SearchNearbyInput): Promise<PlacesSearchResult[]> {
    const body: Record<string, unknown> = {
      includedTypes: input.includedTypes,
      maxResultCount: clampInt(input.maxResultCount ?? MAX_RESULTS_PER_REQUEST, 1, MAX_RESULTS_PER_REQUEST),
      locationRestriction: {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: Math.min(MAX_RADIUS_M, Math.max(0, input.radiusM)),
        },
      },
    };
    if (input.languageCode) body.languageCode = input.languageCode;
    if (input.regionCode) body.regionCode = input.regionCode;

    const data = await this.execute('search', {
      method: 'POST',
      url: `${PLACES_BASE_URL}/places:searchNearby`,
      fieldMask: SEARCH_FIELD_MASK,
      body,
    });
    return placesArray(data).map(normaliseSearchResult);
  }

  async searchText(input: SearchTextInput): Promise<{ places: PlacesSearchResult[]; nextPageToken: string | null }> {
    const body: Record<string, unknown> = {
      textQuery: input.textQuery,
      pageSize: MAX_RESULTS_PER_REQUEST,
    };
    if (typeof input.lat === 'number' && typeof input.lng === 'number') {
      body.locationBias = {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: Math.min(MAX_RADIUS_M, Math.max(0, input.radiusM ?? 5000)),
        },
      };
    }
    if (input.includedType) body.includedType = input.includedType;
    if (input.languageCode) body.languageCode = input.languageCode;
    if (input.regionCode) body.regionCode = input.regionCode;
    if (input.pageToken) body.pageToken = input.pageToken;

    const data = await this.execute('search', {
      method: 'POST',
      url: `${PLACES_BASE_URL}/places:searchText`,
      fieldMask: TEXT_SEARCH_FIELD_MASK,
      body,
    });
    const token = (data as { nextPageToken?: unknown } | null)?.nextPageToken;
    return {
      places: placesArray(data).map(normaliseSearchResult),
      nextPageToken: typeof token === 'string' && token.length > 0 ? token : null,
    };
  }

  async details(placeId: string, opts: { languageCode?: string } = {}): Promise<PlaceDetails> {
    if (!placeId) throw new Error('PlacesClient.details: placeId is required');
    const id = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
    const params = new URLSearchParams();
    if (opts.languageCode) params.set('languageCode', opts.languageCode);
    const qs = params.toString();
    const data = await this.execute('details', {
      method: 'GET',
      url: `${PLACES_BASE_URL}/places/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
      fieldMask: DETAILS_FIELD_MASK,
    });
    return normaliseDetails(data);
  }

  // ---------------------------------------------------------------------------

  private async execute(kind: PlacesCallKind, req: HttpRequest): Promise<unknown> {
    const key = cacheKey(kind, { method: req.method, url: req.url, fieldMask: req.fieldMask, body: req.body ?? null });

    if (this.cache) {
      const hit = await this.cache.get(key);
      if (hit !== null && hit !== undefined) {
        await this.reportCost(kind, true);
        return JSON.parse(hit);
      }
    }

    if (this.beforeRequest) await this.beforeRequest(kind); // throws => abort before any HTTP

    const data = await this.fetchWithBackoff(req);

    if (this.cache) await this.cache.set(key, JSON.stringify(data ?? null), this.cacheTtlSeconds);
    await this.reportCost(kind, false);
    return data;
  }

  private async reportCost(kind: PlacesCallKind, cached: boolean): Promise<void> {
    if (!this.onCost) return;
    const unit = kind === 'search' ? this.pricing.searchUsd : this.pricing.detailsUsd;
    await this.onCost({ kind, units: 1, usd: cached ? 0 : unit, cached });
  }

  private async fetchWithBackoff(req: HttpRequest): Promise<unknown> {
    const headers: Record<string, string> = {
      'X-Goog-Api-Key': this.apiKey,
      'X-Goog-FieldMask': req.fieldMask,
    };
    if (req.method === 'POST') headers['Content-Type'] = 'application/json';

    let lastStatus = 0;
    let lastBody: unknown = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(req.url, {
          method: req.method,
          headers,
          body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
        });
      } catch (err) {
        // Network-level failure: treat like a 5xx and retry.
        lastStatus = 0;
        lastBody = err instanceof Error ? err.message : String(err);
        if (attempt < this.maxAttempts) {
          await this.sleep(backoffDelay(attempt));
          continue;
        }
        throw new PlacesError(`Places ${req.method} ${req.url} failed after ${attempt} attempts: ${lastBody}`, 0, lastBody, attempt);
      }

      const text = await res.text();
      const body = parseJsonSafe(text);
      if (res.ok) return body;

      lastStatus = res.status;
      lastBody = body;
      if (RETRYABLE_STATUSES.has(res.status) && attempt < this.maxAttempts) {
        await this.sleep(backoffDelay(attempt));
        continue;
      }
      throw new PlacesError(
        `Places ${req.method} ${req.url} returned ${res.status}${attempt > 1 ? ` after ${attempt} attempts` : ''}`,
        res.status,
        body,
        attempt,
      );
    }
    throw new PlacesError(`Places ${req.method} ${req.url} failed`, lastStatus, lastBody, this.maxAttempts);
  }
}

/** base 500ms × 2^(attempt-1), plus up to 25% jitter. */
export function backoffDelay(attempt: number, baseMs = BACKOFF_BASE_MS): number {
  const exp = baseMs * 2 ** (attempt - 1);
  return Math.round(exp + Math.random() * exp * 0.25);
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function placesArray(data: unknown): unknown[] {
  const places = (data as { places?: unknown } | null)?.places;
  return Array.isArray(places) ? places : [];
}

function parseJsonSafe(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
