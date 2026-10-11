/** Local mirror of the @sitewright/enrichment-adapters contract (docs/PACKAGES.md). */
export interface EnrichmentLead {
  id: string; businessName: string; countryCode: string; city: string | null; phone: string | null;
  websiteStatus: string; websiteUrl: string | null; address: string | null; placeId: string;
}
export interface ContactCandidate {
  email: string; emailType: 'named' | 'role_generic' | 'catchall_guess'; source: string; sourceUrl: string | null;
  sourceLicence?: string | null; confidence: number;
}
export interface EnrichmentAdapter {
  name: string;
  costPerLookupUsd: number;
  available: boolean;
  unavailableReason?: string;
  supports(lead: EnrichmentLead): boolean;
  find(lead: EnrichmentLead): Promise<ContactCandidate[]>;
}
export type VerifyState = 'unverified' | 'valid' | 'risky' | 'invalid' | 'catchall';
export interface VerifyResult { state: VerifyState; provider: string; reason: string; disposable?: boolean; mxFound?: boolean; raw?: unknown }
export interface EmailVerifier { name: string; costPerCheckUsd: number; verify(email: string): Promise<VerifyResult> }

export const ENRICHMENT_ADAPTERS = Symbol('ENRICHMENT_ADAPTERS');
export const EMAIL_VERIFIER = Symbol('EMAIL_VERIFIER');
