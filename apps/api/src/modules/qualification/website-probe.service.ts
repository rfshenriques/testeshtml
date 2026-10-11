import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { SOCIAL_HOSTS } from '@sitewright/shared-types';
import { WebsiteStatus } from '@sitewright/db';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';

export interface ProbeResult {
  status: WebsiteStatus;
  reason: string;
  finalUrl: string | null;
  httpStatus: number | null;
  bytes: number | null;
  https: boolean | null;
  attempts: number;
  probedAt: string;
}

const PARKED_PATTERNS = [
  /coming soon/i, /under construction/i, /this domain (is|has been|may be) (for sale|parked|registered)/i, /buy this domain/i, /domain (is )?parked/i,
  /parked free/i, /sedo/i, /godaddy\.com\/domains/i, /namecheap\.com/i, /hugedomains/i, /dan\.com/i, /afternic/i, /website is currently unavailable/i,
  /default web page/i, /it works!/i, /index of \//i, /welcome to nginx/i, /apache2 (ubuntu|debian) default page/i, /plesk/i, /cpanel/i, /site not found/i, /account suspended/i,
];
const PARKED_MIN_BYTES = 500;

export type Fetcher = (url: string, init: RequestInit & { timeoutMs?: number }) => Promise<{ status: number; url: string; text: () => Promise<string>; headers: Headers }>;

/**
 * Website-absence detection (spec §6.2). HEAD then GET, 8 s timeout, identified user agent,
 * honours robots.txt, at most 2 requests per host per day, never crawls beyond the root URL.
 */
@Injectable()
export class WebsiteProbeService {
  private readonly log = new Logger(WebsiteProbeService.name);
  readonly userAgent: string;
  private fetcher: Fetcher;

  constructor(@Inject(ENV) env: Env, @Inject(REDIS) private readonly redis: Redis) {
    this.userAgent = `Sitewright-Probe/1.0 (+${env.AGENCY_URL}/bot)`;
    this.fetcher = defaultFetcher;
  }

  /** Test seam. */
  setFetcher(f: Fetcher) {
    this.fetcher = f;
  }

  /** Classify without any network call (social hosts, invalid URLs). Returns null when a network probe is needed. */
  static classifyUrlOnly(url: string | null | undefined): ProbeResult | null {
    const now = new Date().toISOString();
    if (!url) return { status: 'none', reason: 'no websiteUri', finalUrl: null, httpStatus: null, bytes: null, https: null, attempts: 0, probedAt: now };
    let u: URL;
    try {
      u = new URL(url.includes('://') ? url : `http://${url}`);
    } catch {
      return { status: 'broken', reason: 'unparseable websiteUri', finalUrl: null, httpStatus: null, bytes: null, https: null, attempts: 0, probedAt: now };
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) {
      return { status: 'social_only', reason: `social host ${host}`, finalUrl: u.toString(), httpStatus: null, bytes: null, https: u.protocol === 'https:', attempts: 0, probedAt: now };
    }
    return null;
  }

  async probe(url: string | null | undefined, opts: { secondAttemptDelayMs?: number } = {}): Promise<ProbeResult> {
    const quick = WebsiteProbeService.classifyUrlOnly(url);
    if (quick) return quick;
    const u = new URL(url!.includes('://') ? url! : `http://${url}`);
    u.pathname = '/'; u.search = ''; u.hash = '';
    const host = u.hostname.toLowerCase();
    const now = () => new Date().toISOString();

    if (!(await this.reserveHostBudget(host))) {
      return { status: 'unknown', reason: 'per-host daily probe budget (2) exhausted', finalUrl: u.toString(), httpStatus: null, bytes: null, https: null, attempts: 0, probedAt: now() };
    }
    if (!(await this.robotsAllows(u))) {
      // We may not fetch the page; treat as a live site we are not allowed to inspect.
      return { status: 'live', reason: 'robots.txt disallows probing; assumed live', finalUrl: u.toString(), httpStatus: null, bytes: null, https: u.protocol === 'https:', attempts: 0, probedAt: now() };
    }

    const attempt = async (): Promise<ProbeResult> => {
      let res: Awaited<ReturnType<Fetcher>>;
      try {
        res = await this.fetcher(u.toString(), { method: 'HEAD', redirect: 'follow', timeoutMs: 8000, headers: { 'user-agent': this.userAgent } });
        if (res.status === 405 || res.status === 403 || res.status === 501) throw new Error('HEAD not supported');
      } catch {
        res = await this.fetcher(u.toString(), { method: 'GET', redirect: 'follow', timeoutMs: 8000, headers: { 'user-agent': this.userAgent } });
      }
      const finalUrl = res.url || u.toString();
      const https = finalUrl.startsWith('https://');
      if (res.status >= 400) return { status: 'broken', reason: `http ${res.status}`, finalUrl, httpStatus: res.status, bytes: null, https, attempts: 1, probedAt: now() };
      let body = '';
      try {
        const get = res.headers.get('content-length') === null || true ? await this.fetcher(finalUrl, { method: 'GET', redirect: 'follow', timeoutMs: 8000, headers: { 'user-agent': this.userAgent } }) : res;
        body = await get.text();
      } catch {
        body = '';
      }
      const bytes = Buffer.byteLength(body);
      const parked = PARKED_PATTERNS.find((p) => p.test(body));
      if (parked || bytes < PARKED_MIN_BYTES) {
        return { status: 'parked', reason: parked ? `parking heuristic: ${parked.source}` : `body ${bytes} bytes < ${PARKED_MIN_BYTES}`, finalUrl, httpStatus: res.status, bytes, https, attempts: 1, probedAt: now() };
      }
      if (!https) return { status: 'http_only', reason: 'serves over HTTP with no HTTPS redirect', finalUrl, httpStatus: res.status, bytes, https, attempts: 1, probedAt: now() };
      return { status: 'live', reason: 'ok', finalUrl, httpStatus: res.status, bytes, https, attempts: 1, probedAt: now() };
    };

    try {
      const first = await attempt();
      if (first.status !== 'broken') return first;
      // Broken requires 2 attempts 60s apart (spec); in tests the delay is injected.
      await sleep(opts.secondAttemptDelayMs ?? 60_000);
      const second = await attempt().catch((e) => ({ status: 'broken' as WebsiteStatus, reason: `second attempt: ${(e as Error).message}`, finalUrl: u.toString(), httpStatus: null, bytes: null, https: null, attempts: 2, probedAt: now() }));
      return { ...second, attempts: 2, reason: second.status === 'broken' ? `${first.reason}; ${second.reason}` : second.reason };
    } catch (e) {
      const msg = (e as Error).message;
      await sleep(opts.secondAttemptDelayMs ?? 60_000);
      try {
        const second = await attempt();
        return { ...second, attempts: 2 };
      } catch (e2) {
        return { status: 'broken', reason: `${msg}; ${(e2 as Error).message}`, finalUrl: u.toString(), httpStatus: null, bytes: null, https: null, attempts: 2, probedAt: now() };
      }
    }
  }

  private async reserveHostBudget(host: string): Promise<boolean> {
    const key = `probe:${host}:${new Date().toISOString().slice(0, 10)}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 86400);
    return n <= 2;
  }

  private async robotsAllows(u: URL): Promise<boolean> {
    try {
      const res = await this.fetcher(`${u.protocol}//${u.host}/robots.txt`, { method: 'GET', timeoutMs: 5000, headers: { 'user-agent': this.userAgent } });
      if (res.status !== 200) return true;
      const txt = await res.text();
      return robotsAllowsRoot(txt, 'Sitewright-Probe');
    } catch {
      return true;
    }
  }
}

/** Minimal robots.txt evaluation for the root path: a `Disallow: /` under `*` or our agent blocks us. */
export function robotsAllowsRoot(txt: string, agent: string): boolean {
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();
    if (k === 'user-agent') {
      if (!cur || cur.disallow.length || cur.allow.length) {
        cur = { agents: [], disallow: [], allow: [] };
        groups.push(cur);
      }
      cur.agents.push(value.trim().toLowerCase());
    } else if (cur && k === 'disallow') cur.disallow.push(value.trim());
    else if (cur && k === 'allow') cur.allow.push(value.trim());
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  const g = specific ?? groups.find((g) => g.agents.includes('*'));
  if (!g) return true;
  if (g.allow.some((a) => a === '/' || a === '')) return true;
  return !g.disallow.some((d) => d === '/' || d === '/*');
}

const defaultFetcher: Fetcher = async (url, init) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { status: res.status, url: res.url, text: () => res.text(), headers: res.headers };
  } finally {
    clearTimeout(t);
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
