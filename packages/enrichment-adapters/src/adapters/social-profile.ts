import type { AdapterDeps, ContactCandidate, EnrichmentAdapter, EnrichmentLead } from '../types';

/**
 * social-profile adapter (spec §6.4 #1).
 *
 * DECISION: Meta (Facebook/Instagram) and TikTok provide no official API that exposes another
 * business's public contact email for this purpose, and scraping their properties is forbidden
 * (spec §0.3/§20.6 and their terms). The adapter therefore stays unavailable even when `enabled`
 * is true, and never performs network I/O. Revisit only if an official route appears.
 */
export class SocialProfileAdapter implements EnrichmentAdapter {
  readonly name = 'social-profile';
  readonly costPerLookupUsd = 0;
  readonly available = false;
  readonly unavailableReason: string;
  readonly enabled: boolean;

  constructor(deps: AdapterDeps & { enabled: boolean }) {
    this.enabled = deps.enabled;
    this.unavailableReason = deps.enabled
      ? 'DECISION: no official API exposes business contact emails for Meta/Instagram/TikTok profiles; scraping forbidden (spec §20.6).'
      : 'Disabled by configuration; and DECISION: no official API; scraping forbidden (spec §20.6).';
  }

  supports(lead: EnrichmentLead): boolean {
    return lead.websiteStatus === 'social_only';
  }

  async find(_lead: EnrichmentLead): Promise<ContactCandidate[]> {
    throw new Error(`${this.name} unavailable: ${this.unavailableReason}`);
  }
}
