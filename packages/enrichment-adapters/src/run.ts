import type { ContactCandidate, EnrichmentAdapter, EnrichmentLead, VerifyResult } from './types';

export interface RunAdaptersOptions {
  /** Default true: stop at the first candidate verified 'valid' (spec §6.4 "stopping at first verified hit"). */
  stopAtFirstValid?: boolean;
  onAttempt?: (adapter: string, found: number) => void;
}

export interface RunAdaptersResult {
  candidates: (ContactCandidate & { verification: VerifyResult })[];
  adaptersTried: string[];
}

/**
 * Runs adapters in the given (cost) order, skipping unavailable ones and those that do not support the lead.
 * Each candidate is verified as it is found. Candidates without a disclosable `source` are dropped
 * (if you cannot name the source you cannot legally send — spec §6.4). Duplicate emails are verified once.
 */
export async function runAdapters(
  adapters: EnrichmentAdapter[],
  lead: EnrichmentLead,
  verify: (c: ContactCandidate) => Promise<VerifyResult>,
  opts: RunAdaptersOptions = {},
): Promise<RunAdaptersResult> {
  const stopAtFirstValid = opts.stopAtFirstValid ?? true;
  const candidates: RunAdaptersResult['candidates'] = [];
  const adaptersTried: string[] = [];
  const seen = new Set<string>();

  for (const adapter of adapters) {
    if (!adapter.available) continue;
    if (!adapter.supports(lead)) continue;

    adaptersTried.push(adapter.name);
    const found = await adapter.find(lead);
    opts.onAttempt?.(adapter.name, found.length);

    for (const candidate of found) {
      if (!candidate.source || !candidate.source.trim()) continue;
      const key = candidate.email.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const verification = await verify({ ...candidate, email: key });
      candidates.push({ ...candidate, email: key, verification });
      if (stopAtFirstValid && verification.state === 'valid') {
        return { candidates, adaptersTried };
      }
    }
  }
  return { candidates, adaptersTried };
}
