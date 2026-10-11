import { registrableDomain } from '../domain';
import { getJson } from '../http';
import type { AdapterDeps, ContactCandidate, EnrichmentAdapter, EnrichmentLead } from '../types';

export type DataProviderName = 'hunter' | 'apollo' | 'none';

const NO_DOMAIN_STATUSES = new Set(['none', 'social_only']);

type HunterEmail = {
  value?: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  sources?: { uri?: string }[];
};

/**
 * Commercial B2B data providers (spec §6.4 #4). Domain-keyed, so only useful when the lead has a
 * registrable domain (parked/broken/http_only/live sites).
 *
 * - 'hunter': Hunter.io domain-search. Indicative cost 0.01 USD per lookup (plan-dependent; verify).
 * - 'apollo': unavailable. Apollo's name+location reverse lookup is a paid/unclear route — operator DECISION.
 * - 'none': unavailable.
 */
export class DataProviderAdapter implements EnrichmentAdapter {
  readonly name: string;
  readonly costPerLookupUsd: number;
  readonly available: boolean;
  readonly unavailableReason?: string;
  static readonly HUNTER_URL = 'https://api.hunter.io/v2/domain-search';

  constructor(private readonly deps: AdapterDeps & { provider: DataProviderName; apiKey: string }) {
    this.name = `data-provider:${deps.provider}`;
    switch (deps.provider) {
      case 'hunter':
        this.costPerLookupUsd = 0.01;
        this.available = Boolean(deps.apiKey);
        if (!this.available) this.unavailableReason = 'Hunter API key not configured';
        break;
      case 'apollo':
        this.costPerLookupUsd = 0;
        this.available = false;
        this.unavailableReason =
          'DECISION: Apollo name+location reverse lookup is a paid route with unknown hit rate; not contracted (spec §6.4 #4).';
        break;
      default:
        this.costPerLookupUsd = 0;
        this.available = false;
        this.unavailableReason = 'No data provider configured';
    }
  }

  supports(lead: EnrichmentLead): boolean {
    if (this.deps.provider !== 'hunter') return false;
    if (NO_DOMAIN_STATUSES.has(lead.websiteStatus)) return false;
    return lead.websiteUrl !== null && registrableDomain(lead.websiteUrl) !== null;
  }

  async find(lead: EnrichmentLead): Promise<ContactCandidate[]> {
    if (!this.available) throw new Error(`${this.name} unavailable: ${this.unavailableReason}`);
    const domain = lead.websiteUrl ? registrableDomain(lead.websiteUrl) : null;
    if (!domain || NO_DOMAIN_STATUSES.has(lead.websiteStatus)) return [];

    const url = `${DataProviderAdapter.HUNTER_URL}?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(this.deps.apiKey)}`;
    const { body } = await getJson(this.deps, url);
    await this.deps.onCost?.({ adapter: this.name, units: 1, usd: this.costPerLookupUsd });

    const data = (body as { data?: { emails?: HunterEmail[] } } | null)?.data;
    const emails = Array.isArray(data?.emails) ? data!.emails! : [];
    const out: ContactCandidate[] = [];
    for (const e of emails) {
      if (!e.value) continue;
      const conf = typeof e.confidence === 'number' ? e.confidence / 100 : 0;
      out.push({
        email: e.value.toLowerCase(),
        emailType: e.first_name ? 'named' : 'role_generic',
        source: 'data-provider:hunter',
        sourceUrl: e.sources?.[0]?.uri ?? null,
        sourceLicence: 'Hunter.io API terms',
        confidence: Math.max(0, Math.min(1, conf)),
      });
    }
    return out;
  }
}
