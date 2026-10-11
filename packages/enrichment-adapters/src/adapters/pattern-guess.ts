import { registrableDomain } from '../domain';
import type { AdapterDeps, ContactCandidate, EnrichmentAdapter, EnrichmentLead } from '../types';

export const PATTERN_GUESS_LOCAL_PARTS = ['info', 'contact', 'hello', 'office'] as const;
const ALLOWED_STATUSES = new Set(['parked', 'broken', 'http_only', 'live']);

/**
 * pattern-guess (spec §6.4 #5): only where a registrable domain exists. Every candidate is a
 * `catchall_guess` at confidence 0.3 and MUST be verified 'valid' before any send (spec §20.1).
 */
export class PatternGuessAdapter implements EnrichmentAdapter {
  readonly name = 'pattern-guess';
  readonly costPerLookupUsd = 0;
  readonly available = true;

  constructor(private readonly deps: AdapterDeps = {}) {}

  supports(lead: EnrichmentLead): boolean {
    if (!ALLOWED_STATUSES.has(lead.websiteStatus)) return false;
    return lead.websiteUrl !== null && registrableDomain(lead.websiteUrl) !== null;
  }

  async find(lead: EnrichmentLead): Promise<ContactCandidate[]> {
    if (!this.supports(lead)) return [];
    const domain = registrableDomain(lead.websiteUrl!)!;
    await this.deps.onCost?.({ adapter: this.name, units: 1, usd: 0 });
    return PATTERN_GUESS_LOCAL_PARTS.map((lp) => ({
      email: `${lp}@${domain}`,
      emailType: 'catchall_guess' as const,
      source: 'pattern-guess',
      sourceUrl: lead.websiteUrl,
      sourceLicence: null,
      confidence: 0.3,
    }));
  }
}
