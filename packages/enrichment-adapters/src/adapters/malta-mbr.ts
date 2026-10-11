import type { AdapterDeps, ContactCandidate, EnrichmentAdapter, EnrichmentLead } from '../types';

/**
 * Malta Business Registry placeholder (spec §6.4 "registry").
 * The MBR offers no public API for programmatic search; the web portal may not be scraped (spec §20.6).
 * Stays unavailable until an official data access route is contracted (operator DECISION).
 */
export class MaltaMbrAdapter implements EnrichmentAdapter {
  readonly name = 'registry:malta-mbr';
  readonly costPerLookupUsd = 0;
  readonly available = false;
  readonly unavailableReason =
    'DECISION: Malta Business Registry publishes no public API; portal scraping is forbidden (spec §20.6). Contract official data access before enabling.';

  constructor(_deps: AdapterDeps) {}

  supports(lead: EnrichmentLead): boolean {
    return (lead.countryCode || '').toUpperCase() === 'MT';
  }

  async find(_lead: EnrichmentLead): Promise<ContactCandidate[]> {
    throw new Error(`${this.name} unavailable: ${this.unavailableReason}`);
  }
}
