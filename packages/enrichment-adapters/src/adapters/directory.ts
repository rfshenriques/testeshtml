import type { AdapterDeps, ContactCandidate, EnrichmentAdapter, EnrichmentLead } from '../types';

export interface DirectoryProvider {
  name: string;
  /** Licence/terms reference permitting commercial use — recorded on every candidate (spec §6.4 #3). */
  licence: string;
  lookup: (lead: EnrichmentLead) => Promise<ContactCandidate[]>;
  /** Optional indicative cost per lookup; default 0. */
  costPerLookupUsd?: number;
  supports?: (lead: EnrichmentLead) => boolean;
}

/**
 * Licensed directory aggregators. Runs configured providers in order; each candidate is tagged
 * `source: 'directory:<provider>'` and carries the provider's licence.
 */
export class DirectoryAdapter implements EnrichmentAdapter {
  readonly name = 'directory';
  readonly costPerLookupUsd: number;
  readonly available: boolean;
  readonly unavailableReason?: string;
  private readonly providers: DirectoryProvider[];

  constructor(private readonly deps: AdapterDeps & { providers: DirectoryProvider[] }) {
    this.providers = deps.providers ?? [];
    this.available = this.providers.length > 0;
    if (!this.available) this.unavailableReason = 'No licensed directory providers configured';
    this.costPerLookupUsd = this.providers.reduce((s, p) => s + (p.costPerLookupUsd ?? 0), 0);
  }

  supports(lead: EnrichmentLead): boolean {
    return this.providers.some((p) => (p.supports ? p.supports(lead) : true));
  }

  async find(lead: EnrichmentLead): Promise<ContactCandidate[]> {
    if (!this.available) throw new Error(`${this.name} unavailable: ${this.unavailableReason}`);
    const out: ContactCandidate[] = [];
    for (const provider of this.providers) {
      if (provider.supports && !provider.supports(lead)) continue;
      const found = await provider.lookup(lead);
      await this.deps.onCost?.({ adapter: `directory:${provider.name}`, units: 1, usd: provider.costPerLookupUsd ?? 0 });
      for (const c of found) {
        if (!c.email) continue;
        out.push({
          ...c,
          source: `directory:${provider.name}`,
          sourceLicence: provider.licence,
          confidence: clamp01(c.confidence),
        });
      }
    }
    return out;
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
