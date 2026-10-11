import { describe, expect, it, vi } from 'vitest';
import {
  DETAILS_FIELD_MASK,
  PlacesClient,
  PlacesError,
  SEARCH_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
  cacheKey,
  countryCodeFromComponents,
  cityFromComponents,
} from './index';
import type { PlacesCache } from './index';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const rawPlace = {
  id: 'ChIJ123',
  displayName: { text: 'Bella Pizza', languageCode: 'en' },
  formattedAddress: '1 High St, Valletta, Malta',
  location: { latitude: 35.9, longitude: 14.51 },
  primaryType: 'restaurant',
  types: ['restaurant', 'food'],
  websiteUri: 'https://bella.example',
  businessStatus: 'OPERATIONAL',
  rating: 4.5,
  userRatingCount: 120,
};

class MemoryCache implements PlacesCache {
  store = new Map<string, { value: string; ttl: number }>();
  async get(key: string) {
    return this.store.get(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.store.set(key, { value, ttl: ttlSeconds });
  }
}

describe('field masks', () => {
  it('search mask uses places. prefix and the spec fields', () => {
    expect(SEARCH_FIELD_MASK).toBe(
      'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.websiteUri,places.businessStatus,places.rating,places.userRatingCount',
    );
    expect(TEXT_SEARCH_FIELD_MASK).toBe(`${SEARCH_FIELD_MASK},nextPageToken`);
  });
  it('details mask has no prefix and includes the extra fields', () => {
    expect(DETAILS_FIELD_MASK.startsWith('id,displayName,')).toBe(true);
    for (const f of ['nationalPhoneNumber', 'internationalPhoneNumber', 'regularOpeningHours', 'priceLevel', 'editorialSummary', 'reviews', 'photos', 'addressComponents']) {
      expect(DETAILS_FIELD_MASK.split(',')).toContain(f);
    }
    expect(DETAILS_FIELD_MASK).not.toContain('places.');
  });
});

describe('PlacesClient.searchNearby', () => {
  it('sends the documented request and normalises the response', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ places: [rawPlace] }));
    const onCost = vi.fn();
    const client = new PlacesClient({ apiKey: 'k', fetch, onCost });
    const results = await client.searchNearby({ lat: 35.9, lng: 14.5, radiusM: 1000, includedTypes: ['restaurant'], maxResultCount: 50, languageCode: 'en', regionCode: 'mt' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Goog-Api-Key']).toBe('k');
    expect(init.headers['X-Goog-FieldMask']).toBe(SEARCH_FIELD_MASK);
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      includedTypes: ['restaurant'],
      maxResultCount: 20, // clamped
      locationRestriction: { circle: { center: { latitude: 35.9, longitude: 14.5 }, radius: 1000 } },
      languageCode: 'en',
      regionCode: 'mt',
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'ChIJ123',
      displayName: 'Bella Pizza',
      formattedAddress: '1 High St, Valletta, Malta',
      location: { lat: 35.9, lng: 14.51 },
      primaryType: 'restaurant',
      types: ['restaurant', 'food'],
      websiteUri: 'https://bella.example',
      businessStatus: 'OPERATIONAL',
      rating: 4.5,
      userRatingCount: 120,
    });
    expect(results[0].raw).toEqual(rawPlace);
    expect(onCost).toHaveBeenCalledWith({ kind: 'search', units: 1, usd: 0.032, cached: false });
  });

  it('fills nulls for missing fields', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ places: [{ id: 'x' }] }));
    const client = new PlacesClient({ apiKey: 'k', fetch });
    const [r] = await client.searchNearby({ lat: 0, lng: 0, radiusM: 100, includedTypes: ['cafe'] });
    expect(r).toEqual({
      id: 'x', displayName: null, formattedAddress: null, location: null, primaryType: null, types: [],
      websiteUri: null, businessStatus: null, rating: null, userRatingCount: null, raw: { id: 'x' },
    });
  });
});

describe('PlacesClient.searchText', () => {
  it('uses locationBias, pageToken and returns nextPageToken', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ places: [rawPlace], nextPageToken: 'tok2' }));
    const client = new PlacesClient({ apiKey: 'k', fetch });
    const out = await client.searchText({ textQuery: 'dentist valletta', lat: 35.9, lng: 14.5, radiusM: 2000, includedType: 'dentist', pageToken: 'tok1' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(init.headers['X-Goog-FieldMask']).toBe(TEXT_SEARCH_FIELD_MASK);
    expect(JSON.parse(init.body)).toEqual({
      textQuery: 'dentist valletta',
      pageSize: 20,
      locationBias: { circle: { center: { latitude: 35.9, longitude: 14.5 }, radius: 2000 } },
      includedType: 'dentist',
      pageToken: 'tok1',
    });
    expect(out.nextPageToken).toBe('tok2');
    expect(out.places[0].displayName).toBe('Bella Pizza');
  });

  it('returns nextPageToken null when absent', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ places: [] }));
    const client = new PlacesClient({ apiKey: 'k', fetch });
    const out = await client.searchText({ textQuery: 'x' });
    expect(out).toEqual({ places: [], nextPageToken: null });
    expect(JSON.parse(fetch.mock.calls[0][1].body).locationBias).toBeUndefined();
  });
});

describe('PlacesClient.details', () => {
  const rawDetails = {
    ...rawPlace,
    nationalPhoneNumber: '2122 1234',
    internationalPhoneNumber: '+356 2122 1234',
    regularOpeningHours: { weekdayDescriptions: ['Monday: 9 AM – 5 PM'] },
    priceLevel: 'PRICE_LEVEL_MODERATE',
    editorialSummary: { text: 'Cosy pizzeria', languageCode: 'en' },
    reviews: [{ rating: 5, text: { text: 'Great', languageCode: 'en' } }, { rating: 3 }],
    photos: [{ name: 'places/ChIJ123/photos/abc' }],
    addressComponents: [
      { longText: 'Valletta', shortText: 'Valletta', types: ['locality', 'political'] },
      { longText: 'Malta', shortText: 'MT', types: ['country', 'political'] },
    ],
  };

  it('GETs /places/{id} with the details mask and normalises nested fields', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(rawDetails));
    const onCost = vi.fn();
    const client = new PlacesClient({ apiKey: 'k', fetch, onCost });
    const d = await client.details('ChIJ123', { languageCode: 'en' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ123?languageCode=en');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['X-Goog-FieldMask']).toBe(DETAILS_FIELD_MASK);
    expect(d).toMatchObject({
      id: 'ChIJ123',
      displayName: 'Bella Pizza',
      nationalPhoneNumber: '2122 1234',
      internationalPhoneNumber: '+356 2122 1234',
      regularOpeningHours: { weekdayDescriptions: ['Monday: 9 AM – 5 PM'] },
      priceLevel: 2,
      editorialSummary: 'Cosy pizzeria',
      reviews: [{ text: 'Great', rating: 5 }, { text: '', rating: 3 }],
      photos: [{ name: 'places/ChIJ123/photos/abc' }],
    });
    expect(countryCodeFromComponents(d.addressComponents)).toBe('MT');
    expect(cityFromComponents(d.addressComponents)).toBe('Valletta');
    expect(onCost).toHaveBeenCalledWith({ kind: 'details', units: 1, usd: 0.02, cached: false });
  });

  it('accepts a places/ prefixed id', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 'abc' }));
    const client = new PlacesClient({ apiKey: 'k', fetch });
    const d = await client.details('places/abc');
    expect(fetch.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places/abc');
    expect(d.regularOpeningHours).toBeNull();
    expect(d.reviews).toEqual([]);
    expect(d.addressComponents).toEqual([]);
  });
});

describe('backoff', () => {
  it('retries on 429 then succeeds, sleeping with exponential delay', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate' }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: 'down' }, 503))
      .mockResolvedValueOnce(jsonResponse({ places: [rawPlace] }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new PlacesClient({ apiKey: 'k', fetch, sleep });
    const results = await client.searchNearby({ lat: 0, lng: 0, radiusM: 500, includedTypes: ['cafe'] });
    expect(results).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const [d1, d2] = sleep.mock.calls.map((c) => c[0] as number);
    expect(d1).toBeGreaterThanOrEqual(500);
    expect(d1).toBeLessThanOrEqual(625);
    expect(d2).toBeGreaterThanOrEqual(1000);
    expect(d2).toBeLessThanOrEqual(1250);
  });

  it('gives up after maxAttempts and throws PlacesError with status', async () => {
    const fetch = vi.fn().mockImplementation(async () => jsonResponse({ error: 'rate' }, 429));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new PlacesClient({ apiKey: 'k', fetch, sleep, maxAttempts: 5 });
    await expect(client.searchNearby({ lat: 0, lng: 0, radiusM: 500, includedTypes: ['cafe'] })).rejects.toMatchObject({
      name: 'PlacesError', status: 429, attempts: 5,
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it('does not retry on 400 and exposes the body', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad mask' } }, 400));
    const sleep = vi.fn();
    const client = new PlacesClient({ apiKey: 'k', fetch, sleep });
    const err = await client.details('abc').catch((e) => e);
    expect(err).toBeInstanceOf(PlacesError);
    expect(err.status).toBe(400);
    expect(err.body).toEqual({ error: { message: 'bad mask' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('cache', () => {
  it('serves repeat requests from cache without HTTP, reporting usd 0 cached:true', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ places: [rawPlace] }));
    const cache = new MemoryCache();
    const onCost = vi.fn();
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    const client = new PlacesClient({ apiKey: 'k', fetch, cache, onCost, beforeRequest });
    const input = { lat: 35.9, lng: 14.5, radiusM: 1000, includedTypes: ['restaurant'] };

    const first = await client.searchNearby(input);
    const second = await client.searchNearby({ ...input });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(onCost).toHaveBeenNthCalledWith(1, { kind: 'search', units: 1, usd: 0.032, cached: false });
    expect(onCost).toHaveBeenNthCalledWith(2, { kind: 'search', units: 1, usd: 0, cached: true });
    expect([...cache.store.values()][0].ttl).toBe(86400);
  });

  it('uses the configured TTL and distinguishes different requests', async () => {
    const fetch = vi.fn().mockImplementation(async () => jsonResponse({ places: [] }));
    const cache = new MemoryCache();
    const client = new PlacesClient({ apiKey: 'k', fetch, cache, cacheTtlSeconds: 60 });
    await client.searchNearby({ lat: 0, lng: 0, radiusM: 100, includedTypes: ['cafe'] });
    await client.searchNearby({ lat: 0, lng: 0, radiusM: 200, includedTypes: ['cafe'] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(2);
    for (const v of cache.store.values()) expect(v.ttl).toBe(60);
  });

  it('cacheKey is a sha256 hex independent of key order', () => {
    const a = cacheKey('search', { b: 1, a: { d: 2, c: [1, 2] } });
    const b = cacheKey('search', { a: { c: [1, 2], d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey('details', { b: 1, a: { d: 2, c: [1, 2] } })).not.toBe(a);
  });
});

describe('beforeRequest', () => {
  it('is awaited before the HTTP call and aborts when it throws', async () => {
    const fetch = vi.fn();
    const onCost = vi.fn();
    const beforeRequest = vi.fn().mockRejectedValue(new Error('budget exhausted'));
    const client = new PlacesClient({ apiKey: 'k', fetch, onCost, beforeRequest });
    await expect(client.details('abc')).rejects.toThrow('budget exhausted');
    expect(beforeRequest).toHaveBeenCalledWith('details');
    expect(fetch).not.toHaveBeenCalled();
    expect(onCost).not.toHaveBeenCalled();
  });
});

describe('address component helpers', () => {
  it('fall back to postal_town for GB and return null when absent', () => {
    const comps = [
      { longText: 'Reading', shortText: 'Reading', types: ['postal_town'] },
      { longText: 'United Kingdom', shortText: 'GB', types: ['country', 'political'] },
    ];
    expect(cityFromComponents(comps)).toBe('Reading');
    expect(countryCodeFromComponents(comps)).toBe('GB');
    expect(cityFromComponents([])).toBeNull();
    expect(countryCodeFromComponents([])).toBeNull();
  });
});
