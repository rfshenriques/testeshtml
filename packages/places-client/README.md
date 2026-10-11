# @sitewright/places-client

Thin, cost-aware wrapper around the **Google Places API (New)** (spec §6.1) plus pure geometry helpers for quadtree tiling (spec §5.2). Official API only — never scrapes (spec §0.3, §20.6).

## Features

- `searchNearby`, `searchText`, `details` with field masks tuned per call (`SEARCH_FIELD_MASK`, `DETAILS_FIELD_MASK`; text search adds `nextPageToken`).
- Exponential backoff (500 ms base, ×2, up to 25 % jitter) on 429/500/502/503/504, max 5 attempts by default; other 4xx throw `PlacesError` with `status` and `body` immediately.
- Optional `PlacesCache` (e.g. Redis) keyed by `sha256(kind + canonical JSON of the request)`, TTL 24 h by default. Cache hits still call `onCost` with `cached: true, usd: 0`.
- `onCost` is invoked for every successful call; `beforeRequest(kind)` is awaited before each real HTTP call and may throw to abort (budget/quota gate).
- Responses are normalised to `PlacesSearchResult` / `PlaceDetails` (`displayName.text`, `priceLevel` enum → 0..4, `reviews[].text.text`, …) while keeping `raw`.
- Geometry: `haversineM`, `bboxCenter`, `bboxCircumradiusM` (half-diagonal — the circumscribing radius used for tiles), `splitBBox`, `bboxFromCircle`, `bboxFromPolygon`, `pointInPolygon` (GeoJSON rings, holes supported).

## Usage

```ts
import { PlacesClient } from '@sitewright/places-client';

const client = new PlacesClient({
  apiKey: process.env.GOOGLE_PLACES_API_KEY!,
  cache: redisBackedCache,
  onCost: (e) => costEvents.record(e),
  beforeRequest: async () => budget.assertHeadroom(),
});
const places = await client.searchNearby({ lat: 35.9, lng: 14.5, radiusM: 1000, includedTypes: ['dentist'] });
```

Pricing defaults (0.032 / 0.020 USD per request) are indicative — verify against current Google pricing (spec §0.4).
