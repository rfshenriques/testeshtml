import { WebsiteProbeService, robotsAllowsRoot, Fetcher } from './website-probe.service';
import { loadEnv } from '../../shared/config/config';

function makeFetcher(routes: Record<string, { status: number; body?: string; url?: string } | Error>): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    const key = Object.keys(routes).find((k) => url.startsWith(k)) ?? '';
    const r = routes[key];
    if (!r) return { status: 404, url, text: async () => '', headers: new Headers() };
    if (r instanceof Error) throw r;
    return { status: r.status, url: r.url ?? url, text: async () => r.body ?? '', headers: new Headers() };
  };
  return { fetcher, calls };
}

const redisStub = () => {
  const counts = new Map<string, number>();
  return { incr: async (k: string) => { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n; }, expire: async () => 1 } as any;
};
const LONG = 'x'.repeat(2000);

describe('WebsiteProbeService (spec §6.2)', () => {
  const env = loadEnv(process.env);
  const make = (routes: Parameters<typeof makeFetcher>[0]) => {
    const svc = new WebsiteProbeService(env, redisStub());
    const f = makeFetcher(routes);
    svc.setFetcher(f.fetcher);
    return { svc, calls: f.calls };
  };

  it('no websiteUri → none; social hosts → social_only without network', async () => {
    const { svc, calls } = make({});
    expect((await svc.probe(null)).status).toBe('none');
    expect((await svc.probe('https://www.facebook.com/somebiz')).status).toBe('social_only');
    expect((await svc.probe('https://linktr.ee/x')).status).toBe('social_only');
    expect((await svc.probe('instagram.com/x')).status).toBe('social_only');
    expect(calls).toHaveLength(0);
  });
  it('live https site', async () => {
    const { svc, calls } = make({ 'https://example.com/robots.txt': { status: 404 }, 'https://example.com/': { status: 200, body: `<html>${LONG}</html>` } });
    const r = await svc.probe('https://example.com/some/page?x=1');
    expect(r.status).toBe('live');
    expect(calls.every((c) => !c.includes('/some/page'))).toBe(true); // never beyond the root
  });
  it('http without https redirect → http_only', async () => {
    const { svc } = make({ 'http://example.com/robots.txt': { status: 404 }, 'http://example.com/': { status: 200, body: LONG } });
    expect((await svc.probe('http://example.com')).status).toBe('http_only');
  });
  it('http that redirects to https → live', async () => {
    const { svc } = make({ 'http://example.com/robots.txt': { status: 404 }, 'http://example.com/': { status: 200, body: LONG, url: 'https://example.com/' }, 'https://example.com/': { status: 200, body: LONG } });
    expect((await svc.probe('http://example.com')).status).toBe('live');
  });
  it('parking page heuristics and tiny bodies → parked', async () => {
    const { svc } = make({ 'https://parked.test/': { status: 200, body: `<html>${LONG} This domain is for sale</html>` } });
    expect((await svc.probe('https://parked.test')).status).toBe('parked');
    const tiny = make({ 'https://tiny.test/': { status: 200, body: '<html>hi</html>' } });
    expect((await tiny.svc.probe('https://tiny.test')).status).toBe('parked');
  });
  it('4xx/5xx on two attempts → broken; a recovering site is not broken', async () => {
    const { svc } = make({ 'https://down.test/': { status: 503 } });
    const r = await svc.probe('https://down.test', { secondAttemptDelayMs: 1 });
    expect(r.status).toBe('broken');
    expect(r.attempts).toBe(2);
    let n = 0;
    const flaky = new WebsiteProbeService(env, redisStub());
    flaky.setFetcher(async (url, init) => {
      if (url.endsWith('robots.txt')) return { status: 404, url, text: async () => '', headers: new Headers() };
      n++;
      return { status: n <= 1 ? 500 : 200, url, text: async () => LONG, headers: new Headers() };
    });
    expect((await flaky.probe('https://flaky.test', { secondAttemptDelayMs: 1 })).status).toBe('live');
  });
  it('DNS failure / connection refused → broken', async () => {
    const { svc } = make({ 'https://nx.test/': new Error('getaddrinfo ENOTFOUND') });
    expect((await svc.probe('https://nx.test', { secondAttemptDelayMs: 1 })).status).toBe('broken');
  });
  it('honours robots.txt and the identified user agent', async () => {
    const { svc, calls } = make({ 'https://private.test/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /' }, 'https://private.test/': { status: 200, body: LONG } });
    const r = await svc.probe('https://private.test');
    expect(r.status).toBe('live');
    expect(r.reason).toMatch(/robots/);
    expect(calls).toEqual(['GET https://private.test/robots.txt']);
    expect(svc.userAgent).toMatch(/^Sitewright-Probe\/1\.0 \(\+https:\/\/example\.test\/bot\)$/);
  });
  it('allows at most 2 probes per host per day', async () => {
    const { svc } = make({ 'https://busy.test/': { status: 200, body: LONG } });
    await svc.probe('https://busy.test');
    await svc.probe('https://busy.test');
    expect((await svc.probe('https://busy.test')).status).toBe('unknown');
  });
});

describe('robotsAllowsRoot', () => {
  it('parses groups', () => {
    expect(robotsAllowsRoot('User-agent: *\nDisallow: /admin', 'Sitewright-Probe')).toBe(true);
    expect(robotsAllowsRoot('User-agent: *\nDisallow: /', 'Sitewright-Probe')).toBe(false);
    expect(robotsAllowsRoot('User-agent: Sitewright-Probe\nDisallow: /\n\nUser-agent: *\nDisallow:', 'Sitewright-Probe')).toBe(false);
    expect(robotsAllowsRoot('User-agent: Googlebot\nDisallow: /', 'Sitewright-Probe')).toBe(true);
    expect(robotsAllowsRoot('', 'x')).toBe(true);
  });
});
