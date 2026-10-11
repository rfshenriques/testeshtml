import { resolveMx as dnsResolveMx } from 'node:dns/promises';
import { emailDomain, isDisposableDomain, isSyntacticallyValidEmail } from './domain';
import { getJson } from './http';
import type { AdapterDeps, EmailVerifier, VerifyResult } from './types';

type MxRecord = { exchange: string; priority: number };

/**
 * Local checks only: syntax, disposable list, MX lookup (spec §6.5).
 * Never returns 'valid' — only a provider can say valid.
 */
export class LocalVerifier implements EmailVerifier {
  readonly name = 'local';
  readonly costPerCheckUsd = 0;
  private readonly resolveMx: (domain: string) => Promise<MxRecord[]>;

  constructor(deps: { resolveMx?: (domain: string) => Promise<MxRecord[]> } = {}) {
    this.resolveMx = deps.resolveMx ?? ((d) => dnsResolveMx(d));
  }

  async verify(email: string): Promise<VerifyResult> {
    if (!isSyntacticallyValidEmail(email)) {
      return { state: 'invalid', provider: this.name, reason: 'syntax' };
    }
    const domain = emailDomain(email)!;
    if (isDisposableDomain(domain)) {
      return { state: 'invalid', provider: this.name, reason: 'disposable_domain', disposable: true };
    }
    let mx: MxRecord[] = [];
    try {
      mx = await this.resolveMx(domain);
    } catch {
      mx = [];
    }
    if (!Array.isArray(mx) || mx.length === 0) {
      return { state: 'invalid', provider: this.name, reason: 'no_mx', disposable: false, mxFound: false };
    }
    return { state: 'risky', provider: this.name, reason: 'mx_found_unverified', disposable: false, mxFound: true, raw: mx };
  }
}

const ZB_STATUS: Record<string, VerifyResult['state']> = {
  valid: 'valid',
  invalid: 'invalid',
  spamtrap: 'invalid',
  abuse: 'invalid',
  do_not_mail: 'invalid',
  'catch-all': 'catchall',
  unknown: 'risky',
};

/** ZeroBounce v2 single validation. Indicative cost 0.008 USD/check. */
export class ZeroBounceVerifier implements EmailVerifier {
  readonly name = 'zerobounce';
  readonly costPerCheckUsd = 0.008;
  static readonly BASE_URL = 'https://api.zerobounce.net/v2/validate';

  constructor(private readonly deps: AdapterDeps & { apiKey: string }) {
    if (!deps.apiKey) throw new Error('ZeroBounceVerifier: apiKey is required');
  }

  async verify(email: string): Promise<VerifyResult> {
    const url = `${ZeroBounceVerifier.BASE_URL}?api_key=${encodeURIComponent(this.deps.apiKey)}&email=${encodeURIComponent(email)}&ip_address=`;
    const { body } = await getJson(this.deps, url);
    await this.deps.onCost?.({ adapter: `verifier:${this.name}`, units: 1, usd: this.costPerCheckUsd });
    const r = (body ?? {}) as Record<string, unknown>;
    if (typeof r.error === 'string' && r.error) throw new Error(`ZeroBounce error: ${r.error}`);
    const status = String(r.status ?? '').toLowerCase();
    const state = ZB_STATUS[status] ?? 'risky';
    const sub = typeof r.sub_status === 'string' && r.sub_status ? r.sub_status : null;
    return {
      state,
      provider: this.name,
      reason: sub ? `${status}/${sub}` : status || 'unknown',
      disposable: sub === 'disposable' ? true : status ? false : undefined,
      mxFound: r.mx_found === 'true' || r.mx_found === true ? true : r.mx_found === 'false' || r.mx_found === false ? false : undefined,
      raw: body,
    };
  }
}

const NB_RESULT: Record<string, VerifyResult['state']> = {
  valid: 'valid',
  invalid: 'invalid',
  disposable: 'invalid',
  catchall: 'catchall',
  unknown: 'risky',
};

/** NeverBounce v4 single check. Indicative cost 0.008 USD/check. */
export class NeverBounceVerifier implements EmailVerifier {
  readonly name = 'neverbounce';
  readonly costPerCheckUsd = 0.008;
  static readonly BASE_URL = 'https://api.neverbounce.com/v4/single/check';

  constructor(private readonly deps: AdapterDeps & { apiKey: string }) {
    if (!deps.apiKey) throw new Error('NeverBounceVerifier: apiKey is required');
  }

  async verify(email: string): Promise<VerifyResult> {
    const url = `${NeverBounceVerifier.BASE_URL}?key=${encodeURIComponent(this.deps.apiKey)}&email=${encodeURIComponent(email)}`;
    const { body } = await getJson(this.deps, url);
    await this.deps.onCost?.({ adapter: `verifier:${this.name}`, units: 1, usd: this.costPerCheckUsd });
    const r = (body ?? {}) as Record<string, unknown>;
    if (r.status !== undefined && r.status !== 'success') {
      throw new Error(`NeverBounce error: ${String(r.status)}${r.message ? ` - ${String(r.message)}` : ''}`);
    }
    const result = String(r.result ?? '').toLowerCase();
    const flags = Array.isArray(r.flags) ? (r.flags as unknown[]).map(String) : [];
    return {
      state: NB_RESULT[result] ?? 'risky',
      provider: this.name,
      reason: flags.length ? `${result}/${flags.join(',')}` : result || 'unknown',
      disposable: result === 'disposable' ? true : result ? false : undefined,
      mxFound: flags.includes('has_dns_mx') ? true : flags.includes('bad_dns') ? false : undefined,
      raw: body,
    };
  }
}

/** Test double: 'valid' for *.valid.test / validDomains, 'invalid' for *.invalid.test / invalidEmails, 'catchall' for *.catchall.test / catchallDomains, else 'risky'. */
export class FakeVerifier implements EmailVerifier {
  readonly name = 'fake';
  readonly costPerCheckUsd = 0;
  calls: string[] = [];
  private readonly validDomains: Set<string>;
  private readonly invalidEmails: Set<string>;
  private readonly catchallDomains: Set<string>;

  constructor(rules: { validDomains?: string[]; invalidEmails?: string[]; catchallDomains?: string[] } = {}) {
    this.validDomains = new Set((rules.validDomains ?? []).map((d) => d.toLowerCase()));
    this.invalidEmails = new Set((rules.invalidEmails ?? []).map((e) => e.toLowerCase()));
    this.catchallDomains = new Set((rules.catchallDomains ?? []).map((d) => d.toLowerCase()));
  }

  async verify(email: string): Promise<VerifyResult> {
    this.calls.push(email);
    const e = email.toLowerCase();
    const domain = emailDomain(e) ?? '';
    if (!isSyntacticallyValidEmail(e)) return { state: 'invalid', provider: this.name, reason: 'syntax' };
    if (this.invalidEmails.has(e) || domain.endsWith('.invalid.test') || domain === 'invalid.test') {
      return { state: 'invalid', provider: this.name, reason: 'fake_rule_invalid' };
    }
    if (this.validDomains.has(domain) || domain.endsWith('.valid.test') || domain === 'valid.test') {
      return { state: 'valid', provider: this.name, reason: 'fake_rule_valid', mxFound: true };
    }
    if (this.catchallDomains.has(domain) || domain.endsWith('.catchall.test') || domain === 'catchall.test') {
      return { state: 'catchall', provider: this.name, reason: 'fake_rule_catchall', mxFound: true };
    }
    return { state: 'risky', provider: this.name, reason: 'fake_default_risky' };
  }
}

/** Local first (free); if local says invalid stop; otherwise ask the provider (if any). */
export class ChainVerifier implements EmailVerifier {
  readonly name: string;
  readonly costPerCheckUsd: number;

  constructor(
    private readonly local: LocalVerifier,
    private readonly provider: EmailVerifier | null,
  ) {
    this.name = provider ? `chain:${local.name}+${provider.name}` : `chain:${local.name}`;
    this.costPerCheckUsd = provider?.costPerCheckUsd ?? 0;
  }

  async verify(email: string): Promise<VerifyResult> {
    const localResult = await this.local.verify(email);
    if (localResult.state === 'invalid' || !this.provider) return localResult;
    const providerResult = await this.provider.verify(email);
    return {
      ...providerResult,
      disposable: providerResult.disposable ?? localResult.disposable,
      mxFound: providerResult.mxFound ?? localResult.mxFound,
    };
  }
}
