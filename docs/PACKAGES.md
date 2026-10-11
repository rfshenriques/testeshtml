# Package interfaces

The API app codes against these interfaces. They are the contract for `packages/*`.

## @sitewright/places-client

```ts
export interface PlacesSearchResult {
  id: string; displayName: string|null; formattedAddress: string|null; location: {lat:number;lng:number}|null;
  primaryType: string|null; types: string[]; websiteUri: string|null; businessStatus: string|null;
  rating: number|null; userRatingCount: number|null; raw: unknown;
}
export interface PlaceDetails extends PlacesSearchResult {
  nationalPhoneNumber: string|null; internationalPhoneNumber: string|null;
  regularOpeningHours: { weekdayDescriptions: string[] }|null; priceLevel: number|null;
  editorialSummary: string|null; reviews: { text: string; rating: number|null }[]; photos: { name: string }[];
  addressComponents: { longText: string; shortText: string; types: string[] }[];
}
export interface PlacesCache { get(key: string): Promise<string|null>; set(key: string, value: string, ttlSeconds: number): Promise<void>; }
export interface PlacesClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  cache?: PlacesCache;                 // keyed by request hash, TTL 24h
  cacheTtlSeconds?: number;            // default 86400
  onCost?: (e: { kind: 'search'|'details'; units: number; usd: number; cached: boolean }) => void | Promise<void>;
  beforeRequest?: (kind: 'search'|'details') => Promise<void>;   // quota hook; throw to abort
  maxAttempts?: number;                // default 5, exponential backoff on 429/5xx
  sleep?: (ms: number) => Promise<void>;
  pricing?: { searchUsd: number; detailsUsd: number };   // default 0.032 / 0.020 per request
}
export class PlacesClient {
  constructor(opts: PlacesClientOptions);
  searchNearby(input: { lat: number; lng: number; radiusM: number; includedTypes: string[]; maxResultCount?: number; languageCode?: string; regionCode?: string }): Promise<PlacesSearchResult[]>;
  searchText(input: { textQuery: string; lat?: number; lng?: number; radiusM?: number; includedType?: string; languageCode?: string; regionCode?: string; pageToken?: string }): Promise<{ places: PlacesSearchResult[]; nextPageToken: string|null }>;
  details(placeId: string, opts?: { languageCode?: string }): Promise<PlaceDetails>;
}
export const SEARCH_FIELD_MASK: string;   // id,displayName,formattedAddress,location,primaryType,types,websiteUri,businessStatus,rating,userRatingCount
export const DETAILS_FIELD_MASK: string;  // search fields + nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,priceLevel,editorialSummary,reviews,photos,addressComponents
export function countryCodeFromComponents(components: PlaceDetails['addressComponents']): string|null;
export function cityFromComponents(components: PlaceDetails['addressComponents']): string|null;
// Tiling helpers (pure):
export type BBox = [number, number, number, number]; // minLng,minLat,maxLng,maxLat
export function bboxCenter(b: BBox): { lat: number; lng: number };
export function bboxCircumradiusM(b: BBox): number;  // half-diagonal in metres (haversine)
export function splitBBox(b: BBox): [BBox, BBox, BBox, BBox];
export function bboxFromCircle(c: { lat: number; lng: number }, radiusM: number): BBox;
export function bboxFromPolygon(coords: [number, number][][]): BBox;
export function pointInPolygon(p: { lat: number; lng: number }, coords: [number, number][][]): boolean;
export function haversineM(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number;
```

## @sitewright/enrichment-adapters

```ts
export interface EnrichmentLead {
  id: string; businessName: string; countryCode: string; city: string|null; phone: string|null;
  websiteStatus: string; websiteUrl: string|null; address: string|null; placeId: string;
}
export interface ContactCandidate {
  email: string; emailType: 'named'|'role_generic'|'catchall_guess'; source: string; sourceUrl: string|null;
  sourceLicence?: string|null; confidence: number; // 0..1
}
export interface EnrichmentAdapter {
  name: string;                 // e.g. 'registry:companies-house'
  costPerLookupUsd: number;
  available: boolean;           // false when no official route / no API key; never scrape
  unavailableReason?: string;
  supports(lead: EnrichmentLead): boolean;
  find(lead: EnrichmentLead): Promise<ContactCandidate[]>;
}
export interface AdapterDeps { fetch?: typeof fetch; onCost?: (e: { adapter: string; units: number; usd: number }) => void|Promise<void> }
export class SocialProfileAdapter implements EnrichmentAdapter { constructor(deps: AdapterDeps & { enabled: boolean }); } // available=false unless enabled AND an official API exists (none for Meta) -> stays unavailable; documents DECISION
export class CompaniesHouseAdapter implements EnrichmentAdapter { constructor(deps: AdapterDeps & { apiKey: string }); } // GB only; search companies by name (+ locality), take best name match, returns registered email? CH does not publish emails: returns [] but exposes registeredOfficeAddress via `lookupCompany(name, locality)`; `find` returns candidates ONLY when CH exposes a contact email (it generally does not) — document this honestly, keep adapter as the registry template.
export class MaltaMbrAdapter implements EnrichmentAdapter { constructor(deps: AdapterDeps); } // available=false (no public API) placeholder with unavailableReason
export class DirectoryAdapter implements EnrichmentAdapter { constructor(deps: AdapterDeps & { providers: { name: string; licence: string; lookup: (lead: EnrichmentLead) => Promise<ContactCandidate[]> }[] }); }
export class DataProviderAdapter implements EnrichmentAdapter { constructor(deps: AdapterDeps & { provider: 'hunter'|'apollo'|'none'; apiKey: string }); } // hunter domain-search when a domain exists; otherwise unavailable
export class PatternGuessAdapter implements EnrichmentAdapter { constructor(deps: AdapterDeps); } // only when websiteStatus is parked|broken|http_only|live and websiteUrl has a registrable domain: info@, contact@, hello@, office@ as catchall_guess with confidence 0.3; source 'pattern-guess'
export function runAdapters(adapters: EnrichmentAdapter[], lead: EnrichmentLead, verify: (c: ContactCandidate) => Promise<VerifyResult>, opts?: { stopAtFirstValid?: boolean; onAttempt?: (a: string, found: number) => void }): Promise<{ candidates: (ContactCandidate & { verification: VerifyResult })[]; adaptersTried: string[] }>;

// Verification (spec §6.5)
export type VerifyState = 'unverified'|'valid'|'risky'|'invalid'|'catchall';
export interface VerifyResult { state: VerifyState; provider: string; reason: string; disposable?: boolean; mxFound?: boolean; raw?: unknown }
export interface EmailVerifier { name: string; costPerCheckUsd: number; verify(email: string): Promise<VerifyResult>; }
export class LocalVerifier implements EmailVerifier { constructor(deps?: { resolveMx?: (domain: string) => Promise<{exchange:string;priority:number}[]> }); } // syntax + disposable list + MX. Returns 'risky' at best (never 'valid' — only a provider can say valid)
export class ZeroBounceVerifier implements EmailVerifier { constructor(deps: AdapterDeps & { apiKey: string }); }
export class NeverBounceVerifier implements EmailVerifier { constructor(deps: AdapterDeps & { apiKey: string }); }
export class FakeVerifier implements EmailVerifier { constructor(rules?: { validDomains?: string[]; invalidEmails?: string[]; catchallDomains?: string[] }); } // tests: 'valid' for *@*.valid.test or validDomains, 'invalid' for *.invalid.test, 'catchall' for *.catchall.test, else 'risky'
export class ChainVerifier implements EmailVerifier { constructor(local: LocalVerifier, provider: EmailVerifier|null); } // local first; if local says invalid stop; else provider
export function isDisposableDomain(domain: string): boolean;
export function isSyntacticallyValidEmail(email: string): boolean;
export function registrableDomain(urlOrEmail: string): string|null;
```

## @sitewright/email-adapters

```ts
export interface OutboundEmail {
  from: { address: string; name?: string }; to: string; subject: string; text: string; html?: string;
  headers: Record<string,string>; replyTo?: string; messageId?: string; tags?: Record<string,string>;
}
export interface SendResult { providerId: string; accepted: boolean; raw?: unknown }
export interface EmailProvider {
  name: 'ses'|'smartlead'|'fake';
  send(email: OutboundEmail): Promise<SendResult>;
  /** Parse a provider notification (SES SNS JSON, Smartlead webhook) into normalised events. */
  parseWebhook(body: unknown, headers?: Record<string,string>): ProviderEvent[];
}
export type ProviderEvent =
  | { type: 'bounce'; providerId: string|null; recipient: string; hard: boolean; reason: string }
  | { type: 'complaint'; providerId: string|null; recipient: string }
  | { type: 'delivered'; providerId: string|null; recipient: string }
  | { type: 'reply'; providerId: string|null; recipient: string; from: string; subject: string|null; text: string; inReplyTo: string|null; references: string[]; receivedAt: string };
export class SesProvider implements EmailProvider { constructor(opts: { region: string; accessKeyId?: string; secretAccessKey?: string; configurationSet?: string; client?: unknown }); }
export class SmartleadProvider implements EmailProvider { constructor(opts: { apiKey: string; fetch?: typeof fetch; baseUrl?: string }); }
export class FakeProvider implements EmailProvider { sent: OutboundEmail[]; failNext?: Error; constructor(); } // records sends; `simulateBounce(recipient)` etc. return ProviderEvent arrays
export interface InboundMessage { from: string; to: string[]; subject: string|null; text: string; html: string|null; messageId: string|null; inReplyTo: string|null; references: string[]; date: string; raw: string }
export interface InboundSource { name: string; poll(sinceUid?: number): Promise<{ messages: InboundMessage[]; lastUid: number }>; }
export class ImapSource implements InboundSource { constructor(opts: { host: string; port?: number; secure?: boolean; user: string; pass: string; mailbox?: string }); } // imapflow + mailparser
export class FakeInboundSource implements InboundSource { queue: InboundMessage[]; constructor(); push(m: InboundMessage): void }
export function parseRawEmail(raw: string|Buffer): Promise<InboundMessage>;   // mailparser
export function extractReplyText(text: string): string;  // strips quoted history / signatures
export function buildMessageId(domain: string): string;  // <nanoid@domain>
```
