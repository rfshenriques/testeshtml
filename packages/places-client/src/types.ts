export interface PlacesSearchResult {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { lat: number; lng: number } | null;
  primaryType: string | null;
  types: string[];
  websiteUri: string | null;
  businessStatus: string | null;
  rating: number | null;
  userRatingCount: number | null;
  raw: unknown;
}

export interface PlaceDetails extends PlacesSearchResult {
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  regularOpeningHours: { weekdayDescriptions: string[] } | null;
  priceLevel: number | null;
  editorialSummary: string | null;
  reviews: { text: string; rating: number | null }[];
  photos: { name: string }[];
  addressComponents: { longText: string; shortText: string; types: string[] }[];
}

export interface PlacesCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export type PlacesCallKind = 'search' | 'details';

export interface PlacesCostEvent {
  kind: PlacesCallKind;
  units: number;
  usd: number;
  cached: boolean;
}

export interface PlacesClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Keyed by request hash (sha256 of kind + canonical JSON of the request). */
  cache?: PlacesCache;
  /** Default 86400 (24h). */
  cacheTtlSeconds?: number;
  /** Invoked after every call, including cache hits (cached: true, usd 0). */
  onCost?: (e: PlacesCostEvent) => void | Promise<void>;
  /** Quota hook, awaited before each real (non-cached) HTTP call; throw to abort. */
  beforeRequest?: (kind: PlacesCallKind) => Promise<void>;
  /** Default 5; exponential backoff on 429/5xx. */
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Default 0.032 / 0.020 USD per request (indicative, verify at build time — spec §0.4). */
  pricing?: { searchUsd: number; detailsUsd: number };
}

export interface SearchNearbyInput {
  lat: number;
  lng: number;
  radiusM: number;
  includedTypes: string[];
  maxResultCount?: number;
  languageCode?: string;
  regionCode?: string;
}

export interface SearchTextInput {
  textQuery: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  includedType?: string;
  languageCode?: string;
  regionCode?: string;
  pageToken?: string;
}
