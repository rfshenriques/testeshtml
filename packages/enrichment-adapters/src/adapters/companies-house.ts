import { getJson } from '../http';
import type { AdapterDeps, ContactCandidate, EnrichmentAdapter, EnrichmentLead } from '../types';

export interface CompaniesHouseMatch {
  companyNumber: string;
  companyName: string;
  status: string | null;
  registeredOfficeAddress: string | null;
  /** Public register page, disclosable as the Art. 14 source. */
  sourceUrl: string;
}

const CORPORATE_SUFFIXES = new Set([
  'ltd', 'limited', 'plc', 'llp', 'lp', 'inc', 'incorporated', 'llc', 'co', 'company', 'corp', 'corporation',
  'gmbh', 'ag', 'sa', 'sarl', 'srl', 'bv', 'nv', 'oy', 'ab', 'as', 'the', 'and', '&', 'uk', 'group', 'holdings',
]);

/** lowercase, strip punctuation and corporate suffixes, return the remaining tokens. */
export function normaliseCompanyName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !CORPORATE_SUFFIXES.has(t));
}

export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseCompanyName(a));
  const tb = new Set(normaliseCompanyName(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const MIN_SIMILARITY = 0.6;

type ChItem = {
  company_number?: string;
  title?: string;
  company_status?: string;
  address_snippet?: string;
  address?: Record<string, unknown>;
};

/**
 * UK Companies House public register (free official API, GB only; spec §6.4 "registry").
 *
 * Companies House does NOT publish email addresses, so `find()` returns [] — kept as the registry
 * adapter template. Use `lookupCompany()` for the registered office address and the disclosable
 * register URL (useful for postal fallback and Art. 14 sourcing).
 */
export class CompaniesHouseAdapter implements EnrichmentAdapter {
  readonly name = 'registry:companies-house';
  readonly costPerLookupUsd = 0;
  readonly available: boolean;
  readonly unavailableReason?: string;
  static readonly BASE_URL = 'https://api.company-information.service.gov.uk';
  static readonly PUBLIC_URL = 'https://find-and-update.company-information.service.gov.uk';

  constructor(private readonly deps: AdapterDeps & { apiKey: string }) {
    this.available = Boolean(deps.apiKey);
    if (!this.available) this.unavailableReason = 'Companies House API key not configured';
  }

  supports(lead: EnrichmentLead): boolean {
    return (lead.countryCode || '').toUpperCase() === 'GB' && Boolean(lead.businessName);
  }

  /**
   * Companies House exposes no contact email in its public data, so there is never a ContactCandidate
   * to return. No HTTP call is made here; call `lookupCompany` explicitly when the registry record is wanted.
   */
  async find(_lead: EnrichmentLead): Promise<ContactCandidate[]> {
    return [];
  }

  async lookupCompany(name: string, locality?: string | null): Promise<CompaniesHouseMatch | null> {
    if (!this.available) throw new Error(`${this.name} unavailable: ${this.unavailableReason}`);
    if (!name || !name.trim()) return null;
    const url = `${CompaniesHouseAdapter.BASE_URL}/search/companies?q=${encodeURIComponent(name.trim())}&items_per_page=10`;
    const auth = Buffer.from(`${this.deps.apiKey}:`).toString('base64');
    const { body } = await getJson(this.deps, url, { headers: { Authorization: `Basic ${auth}` } });
    await this.deps.onCost?.({ adapter: this.name, units: 1, usd: 0 });

    const items = ((body as { items?: unknown })?.items ?? []) as ChItem[];
    if (!Array.isArray(items) || items.length === 0) return null;

    const loc = locality?.trim().toLowerCase() || null;
    const scored = items
      .filter((it) => it.company_number && it.title)
      .map((it) => {
        const sim = nameSimilarity(name, it.title!);
        const addrLocality = String(it.address?.locality ?? '').toLowerCase();
        const snippet = String(it.address_snippet ?? '').toLowerCase();
        const localityMatch = loc !== null && (addrLocality.includes(loc) || snippet.includes(loc));
        return { it, sim, localityMatch };
      })
      .filter((s) => s.sim >= MIN_SIMILARITY);
    if (scored.length === 0) return null;

    const pool = loc && scored.some((s) => s.localityMatch) ? scored.filter((s) => s.localityMatch) : scored;
    pool.sort((a, b) => b.sim - a.sim || Number(b.it.company_status === 'active') - Number(a.it.company_status === 'active'));
    const best = pool[0].it;
    const number = best.company_number!;
    return {
      companyNumber: number,
      companyName: best.title!,
      status: best.company_status ?? null,
      registeredOfficeAddress: formatAddress(best),
      sourceUrl: `${CompaniesHouseAdapter.PUBLIC_URL}/company/${encodeURIComponent(number)}`,
    };
  }
}

function formatAddress(item: ChItem): string | null {
  if (item.address_snippet) return item.address_snippet;
  const a = item.address ?? {};
  const parts = ['premises', 'address_line_1', 'address_line_2', 'locality', 'region', 'postal_code', 'country']
    .map((k) => a[k])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}
