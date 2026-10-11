export interface EnrichmentLead {
  id: string;
  businessName: string;
  countryCode: string;
  city: string | null;
  phone: string | null;
  websiteStatus: string;
  websiteUrl: string | null;
  address: string | null;
  placeId: string;
}

export interface ContactCandidate {
  email: string;
  emailType: 'named' | 'role_generic' | 'catchall_guess';
  /** Disclosable origin (Art. 14 notice quotes it). Never empty. */
  source: string;
  sourceUrl: string | null;
  sourceLicence?: string | null;
  /** 0..1 */
  confidence: number;
}

export interface EnrichmentAdapter {
  /** e.g. 'registry:companies-house' */
  name: string;
  costPerLookupUsd: number;
  /** false when no official route / no API key; never scrape */
  available: boolean;
  unavailableReason?: string;
  supports(lead: EnrichmentLead): boolean;
  find(lead: EnrichmentLead): Promise<ContactCandidate[]>;
}

export interface AdapterCostEvent {
  adapter: string;
  units: number;
  usd: number;
}

export interface AdapterDeps {
  fetch?: typeof fetch;
  onCost?: (e: AdapterCostEvent) => void | Promise<void>;
  /** Injectable sleep for backoff (tests). Additive to the PACKAGES.md contract. */
  sleep?: (ms: number) => Promise<void>;
}

// Verification (spec §6.5)
export type VerifyState = 'unverified' | 'valid' | 'risky' | 'invalid' | 'catchall';

export interface VerifyResult {
  state: VerifyState;
  provider: string;
  reason: string;
  disposable?: boolean;
  mxFound?: boolean;
  raw?: unknown;
}

export interface EmailVerifier {
  name: string;
  costPerCheckUsd: number;
  verify(email: string): Promise<VerifyResult>;
}
