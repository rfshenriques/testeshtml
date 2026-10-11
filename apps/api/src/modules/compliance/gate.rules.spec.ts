import { evaluateGate, GateInput, OVERRIDABLE_REASONS } from './gate.rules';
import type { JurisdictionPolicy } from '@sitewright/shared-types';

const MT: JurisdictionPolicy = {
  countryCode: 'MT', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false,
  requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 24,
  defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: 'test',
};
const DE: JurisdictionPolicy = { ...MT, countryCode: 'DE', priorConsentRequired: true, b2bColdEmailAllowed: false };
const US: JurisdictionPolicy = { ...MT, countryCode: 'US', soleTraderTreatedAsIndividual: false, requiresDataSourceDisclosure: false };

const base: GateInput = {
  countryCode: 'MT', businessName: 'Valletta Dental Clinic Ltd', reviewCount: 120, policy: MT, suppressed: false,
  primaryContact: { email: 'info@vallettadental.com', verification: 'valid', source: 'registry:mbr', sourceUrl: 'https://registry.mbr.mt/x' },
};

describe('evaluateGate (spec §8) — every branch', () => {
  it('clears a fully compliant corporate lead', () => {
    expect(evaluateGate(base)).toEqual({ result: 'clear', reason: null, detail: null, overridden: false });
  });
  it('blocks when there is no policy for the country (fail closed)', () => {
    const r = evaluateGate({ ...base, countryCode: 'XX', policy: null });
    expect(r.result).toBe('blocked');
    expect(r.reason).toBe('no policy for country');
  });
  it('blocks in a prior-consent jurisdiction', () => {
    expect(evaluateGate({ ...base, countryCode: 'DE', policy: DE }).reason).toBe('prior consent jurisdiction');
  });
  it('blocks when b2b cold email is not allowed even if priorConsentRequired is false', () => {
    expect(evaluateGate({ ...base, policy: { ...MT, b2bColdEmailAllowed: false } }).reason).toBe('prior consent jurisdiction');
  });
  it('blocks suppressed leads', () => {
    expect(evaluateGate({ ...base, suppressed: true }).reason).toBe('suppressed');
  });
  it('blocks when there is no primary contact', () => {
    expect(evaluateGate({ ...base, primaryContact: null }).reason).toBe('no contact');
  });
  it.each(['unverified', 'risky', 'invalid', 'catchall'] as const)('blocks when the contact verification is %s', (v) => {
    const r = evaluateGate({ ...base, primaryContact: { ...base.primaryContact!, verification: v } });
    expect(r.reason).toBe('unverified');
  });
  it('blocks when the contact source cannot be named (Art.14)', () => {
    expect(evaluateGate({ ...base, primaryContact: { ...base.primaryContact!, source: '' } }).reason).toBe('undisclosable source');
    expect(evaluateGate({ ...base, primaryContact: { ...base.primaryContact!, source: null } }).reason).toBe('undisclosable source');
  });
  it('blocks a sole-trader-looking business where sole traders are individuals', () => {
    const r = evaluateGate({ ...base, businessName: 'Maria Borg', reviewCount: 4 });
    expect(r.reason).toBe('individual subscriber');
  });
  it('does not apply the sole-trader rule where the policy says so (US)', () => {
    expect(evaluateGate({ ...base, countryCode: 'US', policy: US, businessName: 'Maria Borg', reviewCount: 4 }).result).toBe('clear');
  });
  it('the branches are evaluated in spec order (policy before suppression before contact)', () => {
    expect(evaluateGate({ ...base, policy: null, suppressed: true, primaryContact: null }).reason).toBe('no policy for country');
    expect(evaluateGate({ ...base, suppressed: true, primaryContact: null }).reason).toBe('suppressed');
  });

  describe('operator override', () => {
    it('clears an individual-subscriber block with a matching justified override', () => {
      const r = evaluateGate({ ...base, businessName: 'Maria Borg', reviewCount: 4, override: { reason: 'individual subscriber', justification: 'Confirmed registered company via MBR C12345' } });
      expect(r.result).toBe('clear');
      expect(r.overridden).toBe(true);
    });
    it('clears a prior-consent block with a matching override (consent obtained by phone)', () => {
      const r = evaluateGate({ ...base, policy: DE, override: { reason: 'prior consent jurisdiction', justification: 'Consent given on call 2026-10-01, recorded' } });
      expect(r.result).toBe('clear');
    });
    it('an override for a different reason does not apply', () => {
      const r = evaluateGate({ ...base, businessName: 'Maria Borg', reviewCount: 4, override: { reason: 'prior consent jurisdiction', justification: 'x'.repeat(30) } });
      expect(r.result).toBe('blocked');
      expect(r.reason).toBe('individual subscriber');
    });
    it.each(['suppressed', 'no contact', 'unverified', 'undisclosable source', 'no policy for country'] as const)('"%s" can never be overridden', (reason) => {
      expect(OVERRIDABLE_REASONS.has(reason)).toBe(false);
      const inputs: Record<string, GateInput> = {
        suppressed: { ...base, suppressed: true },
        'no contact': { ...base, primaryContact: null },
        unverified: { ...base, primaryContact: { ...base.primaryContact!, verification: 'risky' } },
        'undisclosable source': { ...base, primaryContact: { ...base.primaryContact!, source: null } },
        'no policy for country': { ...base, policy: null },
      };
      const r = evaluateGate({ ...inputs[reason], override: { reason, justification: 'y'.repeat(30) } });
      expect(r.result).toBe('blocked');
      expect(r.reason).toBe(reason);
    });
    it('an overridden prior-consent block still blocks on later checks', () => {
      const r = evaluateGate({ ...base, policy: DE, suppressed: true, override: { reason: 'prior consent jurisdiction', justification: 'z'.repeat(30) } });
      expect(r.reason).toBe('suppressed');
    });
  });
});
