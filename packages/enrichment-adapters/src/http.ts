import type { AdapterDeps } from './types';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const BASE_MS = 500;

export class AdapterHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'AdapterHttpError';
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function resolveFetch(deps: AdapterDeps): typeof fetch {
  const f = deps.fetch ?? globalThis.fetch;
  if (typeof f !== 'function') throw new Error('No fetch implementation available');
  return f;
}

/**
 * GET JSON with exponential backoff on 429/5xx (max 5 attempts, spec §6.1 pattern).
 * Throws AdapterHttpError on other non-2xx statuses or when attempts are exhausted.
 */
export async function getJson(
  deps: AdapterDeps,
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const fetchImpl = resolveFetch(deps);
  const sleep = deps.sleep ?? defaultSleep;
  let last: { status: number; body: unknown } = { status: 0, body: null };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
    } catch (err) {
      last = { status: 0, body: err instanceof Error ? err.message : String(err) };
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new AdapterHttpError(`GET ${redact(url)} failed: ${String(last.body)}`, 0, last.body);
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (res.ok) return { status: res.status, body };
    last = { status: res.status, body };
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(backoff(attempt));
      continue;
    }
    throw new AdapterHttpError(`GET ${redact(url)} returned ${res.status}`, res.status, body);
  }
  throw new AdapterHttpError(`GET ${redact(url)} failed`, last.status, last.body);
}

function backoff(attempt: number): number {
  const exp = BASE_MS * 2 ** (attempt - 1);
  return Math.round(exp + Math.random() * exp * 0.25);
}

/** Strip obvious credentials from URLs before they end up in error messages/logs. */
function redact(url: string): string {
  return url.replace(/([?&](?:api_key|key|apikey)=)[^&]+/gi, '$1***');
}
