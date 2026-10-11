import { describe, expect, it, vi } from 'vitest';
import {
  CompaniesHouseAdapter,
  DataProviderAdapter,
  DirectoryAdapter,
  FakeVerifier,
  MaltaMbrAdapter,
  PatternGuessAdapter,
  SocialProfileAdapter,
  nameSimilarity,
  runAdapters,
} from './index';
import type { ContactCandidate, EnrichmentAdapter, EnrichmentLead } from './index';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const lead = (over: Partial<EnrichmentLead> = {}): EnrichmentLead => ({
  id: 'lead1',
  businessName: 'Bella Pizza',
  countryCode: 'GB',
  city: 'Reading',
  phone: null,
  websiteStatus: 'none',
  websiteUrl: null,
  address: null,
  placeId: 'ChIJ1',
  ...over,
});

describe('CompaniesHouseAdapter', () => {
  const items = [
    { company_number: '01234567', title: 'BELLA PIZZA LIMITED', company_status: 'active', address_snippet: '1 High St, Reading, RG1 1AA', address: { locality: 'Reading' } },
    { company_number: '07654321', title: 'BELLA PIZZA (LONDON) LTD', company_status: 'dissolved', address_snippet: '2 Low St, London', address: { locality: 'London' } },
    { company_number: '09999999', title: 'TOTALLY DIFFERENT CO LTD', company_status: 'active', address_snippet: 'Reading', address: { locality: 'Reading' } },
  ];

  it('searches with basic auth, picks best name+locality match, reports zero cost', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({ items }));
    const onCost = vi.fn();
    const ch = new CompaniesHouseAdapter({ apiKey: 'chkey', fetch, onCost });
    expect(ch.available).toBe(true);
    expect(ch.supports(lead())).toBe(true);
    expect(ch.supports(lead({ countryCode: 'MT' }))).toBe(false);

    const match = await ch.lookupCompany('Bella Pizza Ltd', 'Reading');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.company-information.service.gov.uk/search/companies?q=Bella%20Pizza%20Ltd&items_per_page=10');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('chkey:').toString('base64')}`);
    expect(match).toEqual({
      companyNumber: '01234567',
      companyName: 'BELLA PIZZA LIMITED',
      status: 'active',
      registeredOfficeAddress: '1 High St, Reading, RG1 1AA',
      sourceUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
    });
    expect(onCost).toHaveBeenCalledWith({ adapter: 'registry:companies-house', units: 1, usd: 0 });
  });

  it('falls back to best name match when locality does not match, and null below threshold', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({ items }));
    const ch = new CompaniesHouseAdapter({ apiKey: 'chkey', fetch });
    const m = await ch.lookupCompany('Bella Pizza', 'Bristol');
    expect(m?.companyNumber).toBe('01234567');
    expect(await ch.lookupCompany('Zebra Plumbing', null)).toBeNull();
  });

  it('find() returns [] without HTTP (Companies House publishes no emails)', async () => {
    const fetch = vi.fn();
    const ch = new CompaniesHouseAdapter({ apiKey: 'chkey', fetch });
    expect(await ch.find(lead())).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is unavailable without an api key', () => {
    const ch = new CompaniesHouseAdapter({ apiKey: '' });
    expect(ch.available).toBe(false);
    expect(ch.unavailableReason).toMatch(/key/);
  });

  it('nameSimilarity strips corporate suffixes', () => {
    expect(nameSimilarity('Bella Pizza Ltd', 'BELLA PIZZA LIMITED')).toBe(1);
    expect(nameSimilarity('Bella Pizza', 'Bella Pasta')).toBeLessThan(0.6);
  });
});

describe('MaltaMbrAdapter', () => {
  it('is unavailable, supports MT, and throws on find', async () => {
    const a = new MaltaMbrAdapter({});
    expect(a.available).toBe(false);
    expect(a.unavailableReason).toMatch(/no public API/i);
    expect(a.supports(lead({ countryCode: 'MT' }))).toBe(true);
    expect(a.supports(lead({ countryCode: 'GB' }))).toBe(false);
    await expect(a.find(lead({ countryCode: 'MT' }))).rejects.toThrow(/unavailable/);
  });
});

describe('SocialProfileAdapter', () => {
  it('stays unavailable even when enabled and never fetches', async () => {
    const fetch = vi.fn();
    const a = new SocialProfileAdapter({ enabled: true, fetch });
    expect(a.available).toBe(false);
    expect(a.unavailableReason).toMatch(/DECISION: no official API/);
    expect(a.unavailableReason).toMatch(/scraping forbidden/i);
    expect(a.supports(lead({ websiteStatus: 'social_only' }))).toBe(true);
    await expect(a.find(lead({ websiteStatus: 'social_only' }))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(new SocialProfileAdapter({ enabled: false }).available).toBe(false);
  });
});

describe('DirectoryAdapter', () => {
  it('is unavailable with no providers', () => {
    const a = new DirectoryAdapter({ providers: [] });
    expect(a.available).toBe(false);
    expect(a.unavailableReason).toBeTruthy();
  });
  it('runs providers in order and tags source + licence', async () => {
    const onCost = vi.fn();
    const a = new DirectoryAdapter({
      onCost,
      providers: [
        { name: 'yellow', licence: 'Yellow Ltd commercial licence #1', costPerLookupUsd: 0.002, lookup: async () => [{ email: 'a@x.com', emailType: 'role_generic', source: 'whatever', sourceUrl: 'https://yellow.example/a', confidence: 0.8 }] },
        { name: 'blue', licence: 'Blue API terms', lookup: async () => [{ email: 'b@x.com', emailType: 'named', source: '', sourceUrl: null, confidence: 2 }] },
      ],
    });
    expect(a.available).toBe(true);
    expect(a.costPerLookupUsd).toBeCloseTo(0.002);
    const out = await a.find(lead());
    expect(out).toEqual([
      { email: 'a@x.com', emailType: 'role_generic', source: 'directory:yellow', sourceLicence: 'Yellow Ltd commercial licence #1', sourceUrl: 'https://yellow.example/a', confidence: 0.8 },
      { email: 'b@x.com', emailType: 'named', source: 'directory:blue', sourceLicence: 'Blue API terms', sourceUrl: null, confidence: 1 },
    ]);
    expect(onCost).toHaveBeenNthCalledWith(1, { adapter: 'directory:yellow', units: 1, usd: 0.002 });
    expect(onCost).toHaveBeenNthCalledWith(2, { adapter: 'directory:blue', units: 1, usd: 0 });
  });
});

describe('DataProviderAdapter', () => {
  const hunterBody = {
    data: {
      domain: 'bella.co.uk',
      emails: [
        { value: 'Jane.Doe@bella.co.uk', type: 'personal', confidence: 92, first_name: 'Jane', last_name: 'Doe', sources: [{ uri: 'https://bella.co.uk/team' }] },
        { value: 'info@bella.co.uk', type: 'generic', confidence: 70, first_name: null, last_name: null, sources: [] },
      ],
    },
  };

  it('hunter: calls domain-search for leads with a domain and maps results', async () => {
    const fetch = vi.fn().mockImplementation(async () => json(hunterBody));
    const onCost = vi.fn();
    const a = new DataProviderAdapter({ provider: 'hunter', apiKey: 'hk', fetch, onCost });
    expect(a.name).toBe('data-provider:hunter');
    expect(a.available).toBe(true);
    expect(a.costPerLookupUsd).toBe(0.01);
    const l = lead({ websiteStatus: 'parked', websiteUrl: 'https://www.bella.co.uk/' });
    expect(a.supports(l)).toBe(true);
    expect(a.supports(lead({ websiteStatus: 'none', websiteUrl: null }))).toBe(false);
    expect(a.supports(lead({ websiteStatus: 'social_only', websiteUrl: 'https://facebook.com/bella' }))).toBe(false);

    const out = await a.find(l);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://api.hunter.io/v2/domain-search');
    expect(url.searchParams.get('domain')).toBe('bella.co.uk');
    expect(url.searchParams.get('api_key')).toBe('hk');
    expect(out).toEqual([
      { email: 'jane.doe@bella.co.uk', emailType: 'named', source: 'data-provider:hunter', sourceUrl: 'https://bella.co.uk/team', sourceLicence: 'Hunter.io API terms', confidence: 0.92 },
      { email: 'info@bella.co.uk', emailType: 'role_generic', source: 'data-provider:hunter', sourceUrl: null, sourceLicence: 'Hunter.io API terms', confidence: 0.7 },
    ]);
    expect(onCost).toHaveBeenCalledWith({ adapter: 'data-provider:hunter', units: 1, usd: 0.01 });
  });

  it('apollo and none are unavailable', () => {
    const apollo = new DataProviderAdapter({ provider: 'apollo', apiKey: 'x' });
    expect(apollo.available).toBe(false);
    expect(apollo.unavailableReason).toMatch(/DECISION/);
    expect(apollo.supports(lead({ websiteStatus: 'live', websiteUrl: 'https://bella.co.uk' }))).toBe(false);
    const none = new DataProviderAdapter({ provider: 'none', apiKey: '' });
    expect(none.available).toBe(false);
    expect(new DataProviderAdapter({ provider: 'hunter', apiKey: '' }).available).toBe(false);
  });
});

describe('PatternGuessAdapter', () => {
  it('guesses only for allowed statuses with a registrable domain', async () => {
    const onCost = vi.fn();
    const a = new PatternGuessAdapter({ onCost });
    expect(a.available).toBe(true);
    for (const status of ['parked', 'broken', 'http_only', 'live']) {
      expect(a.supports(lead({ websiteStatus: status, websiteUrl: 'https://bella.co.uk/x' })), status).toBe(true);
    }
    expect(a.supports(lead({ websiteStatus: 'none', websiteUrl: null }))).toBe(false);
    expect(a.supports(lead({ websiteStatus: 'social_only', websiteUrl: 'https://facebook.com/bella' }))).toBe(false);
    expect(a.supports(lead({ websiteStatus: 'live', websiteUrl: null }))).toBe(false);
    expect(a.supports(lead({ websiteStatus: 'live', websiteUrl: 'http://10.0.0.1' }))).toBe(false);

    const out = await a.find(lead({ websiteStatus: 'parked', websiteUrl: 'https://www.bella.co.uk/x' }));
    expect(out.map((c) => c.email)).toEqual(['info@bella.co.uk', 'contact@bella.co.uk', 'hello@bella.co.uk', 'office@bella.co.uk']);
    for (const c of out) {
      expect(c).toMatchObject({ emailType: 'catchall_guess', confidence: 0.3, source: 'pattern-guess', sourceUrl: 'https://www.bella.co.uk/x' });
    }
    expect(onCost).toHaveBeenCalledWith({ adapter: 'pattern-guess', units: 1, usd: 0 });
    expect(await a.find(lead({ websiteStatus: 'none' }))).toEqual([]);
  });
});

describe('runAdapters', () => {
  const mk = (name: string, cands: ContactCandidate[], over: Partial<EnrichmentAdapter> = {}): EnrichmentAdapter & { find: ReturnType<typeof vi.fn> } => ({
    name,
    costPerLookupUsd: 0,
    available: true,
    supports: () => true,
    ...over,
    find: vi.fn().mockResolvedValue(cands),
  });
  const cand = (email: string, source = 'test'): ContactCandidate => ({ email, emailType: 'role_generic', source, sourceUrl: null, confidence: 0.5 });

  it('skips unavailable/unsupported adapters, verifies each candidate and stops at first valid', async () => {
    const unavailable = mk('a-unavailable', [cand('x@shop.valid.test')], { available: false });
    const unsupported = mk('b-unsupported', [cand('y@shop.valid.test')], { supports: () => false });
    const first = mk('c', [cand('risky@other.example'), cand('ok@shop.valid.test'), cand('never@shop.valid.test')]);
    const second = mk('d', [cand('z@shop.valid.test')]);
    const verifier = new FakeVerifier();
    const onAttempt = vi.fn();

    const res = await runAdapters([unavailable, unsupported, first, second], lead(), (c) => verifier.verify(c.email), { onAttempt });
    expect(res.adaptersTried).toEqual(['c']);
    expect(res.candidates.map((c) => [c.email, c.verification.state])).toEqual([
      ['risky@other.example', 'risky'],
      ['ok@shop.valid.test', 'valid'],
    ]);
    expect(unavailable.find).not.toHaveBeenCalled();
    expect(unsupported.find).not.toHaveBeenCalled();
    expect(second.find).not.toHaveBeenCalled();
    expect(verifier.calls).toEqual(['risky@other.example', 'ok@shop.valid.test']);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith('c', 3);
  });

  it('continues through all adapters when stopAtFirstValid is false, drops empty-source and dedupes', async () => {
    const first = mk('c', [cand('ok@shop.valid.test'), cand('nosource@shop.valid.test', ''), cand('OK@shop.valid.test')]);
    const second = mk('d', [cand('z@x.invalid.test')]);
    const verifier = new FakeVerifier();
    const res = await runAdapters([first, second], lead(), (c) => verifier.verify(c.email), { stopAtFirstValid: false });
    expect(res.adaptersTried).toEqual(['c', 'd']);
    expect(res.candidates.map((c) => c.email)).toEqual(['ok@shop.valid.test', 'z@x.invalid.test']);
    expect(res.candidates[1].verification.state).toBe('invalid');
  });

  it('propagates adapter errors', async () => {
    const boom = mk('boom', []);
    boom.find.mockRejectedValue(new Error('provider down'));
    await expect(runAdapters([boom], lead(), async () => ({ state: 'risky', provider: 'x', reason: '' }))).rejects.toThrow('provider down');
  });
});
