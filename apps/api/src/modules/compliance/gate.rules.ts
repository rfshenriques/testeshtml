import type { JurisdictionPolicy } from '@sitewright/shared-types';
import { looksLikeSoleTrader } from './sole-trader';

/** Pure legal-gate evaluation (spec §8). No IO; every branch is unit tested. */
export interface GateContact {
  email: string;
  verification: 'unverified' | 'valid' | 'risky' | 'invalid' | 'catchall';
  source: string | null;
  sourceUrl: string | null;
}

export interface GateInput {
  countryCode: string;
  businessName: string;
  reviewCount: number | null;
  policy: JurisdictionPolicy | null;
  suppressed: boolean;
  primaryContact: GateContact | null;
  /** Operator override already recorded for this lead (reason it overrides + justification). */
  override?: { reason: string; justification: string } | null;
}

export type GateReason =
  | 'no policy for country'
  | 'prior consent jurisdiction'
  | 'suppressed'
  | 'no contact'
  | 'unverified'
  | 'undisclosable source'
  | 'individual subscriber';

export interface GateResult {
  result: 'clear' | 'blocked';
  reason: GateReason | null;
  detail: string | null;
  overridden: boolean;
}

/** Reasons an operator may override with a written justification (spec §8). Never: suppression, missing/unverified contact, undisclosable source, missing policy. */
export const OVERRIDABLE_REASONS: ReadonlySet<GateReason> = new Set<GateReason>(['individual subscriber', 'prior consent jurisdiction']);

export function evaluateGate(input: GateInput): GateResult {
  const blocked = (reason: GateReason, detail: string | null = null): GateResult => {
    if (input.override && input.override.reason === reason && OVERRIDABLE_REASONS.has(reason)) {
      return { result: 'clear', reason, detail: `overridden: ${input.override.justification}`, overridden: true };
    }
    return { result: 'blocked', reason, detail, overridden: false };
  };

  const policy = input.policy;
  if (!policy) return blocked('no policy for country', `no JurisdictionPolicy for ${input.countryCode}; fail closed`);
  if (policy.priorConsentRequired || !policy.b2bColdEmailAllowed) {
    const r = blocked('prior consent jurisdiction', policy.notes);
    if (r.result === 'blocked') return r;
    // overridden: continue through the remaining checks, which can still block.
  }
  if (input.suppressed) return blocked('suppressed');
  const contact = input.primaryContact;
  if (!contact) return blocked('no contact');
  if (contact.verification !== 'valid') return blocked('unverified', `primary contact verification=${contact.verification}`);
  if (!contact.source || !contact.source.trim()) return blocked('undisclosable source', 'contact has no named source; Art.14 notice cannot be generated');
  if (policy.soleTraderTreatedAsIndividual) {
    const v = looksLikeSoleTrader(input.businessName, input.reviewCount);
    if (v.soleTrader) {
      const r = blocked('individual subscriber', v.reason);
      if (r.result === 'blocked') return r;
    }
  }
  const overridden = !!input.override && OVERRIDABLE_REASONS.has(input.override.reason as GateReason);
  return { result: 'clear', reason: null, detail: null, overridden };
}
