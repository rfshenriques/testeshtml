import { describe, expect, it, vi } from 'vitest';
import { ChainVerifier, FakeVerifier, LocalVerifier, NeverBounceVerifier, ZeroBounceVerifier } from './verifiers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('LocalVerifier', () => {
  it('returns invalid for bad syntax without touching DNS', async () => {
    const resolveMx = vi.fn();
    const v = new LocalVerifier({ resolveMx });
    expect(await v.verify('nope')).toMatchObject({ state: 'invalid', provider: 'local', reason: 'syntax' });
    expect(resolveMx).not.toHaveBeenCalled();
  });
  it('returns invalid for disposable domains', async () => {
    const resolveMx = vi.fn();
    const v = new LocalVerifier({ resolveMx });
    expect(await v.verify('x@mailinator.com')).toMatchObject({ state: 'invalid', reason: 'disposable_domain', disposable: true });
    expect(resolveMx).not.toHaveBeenCalled();
  });
  it('returns invalid when no MX (empty or DNS error)', async () => {
    const v1 = new LocalVerifier({ resolveMx: async () => [] });
    expect(await v1.verify('x@example.com')).toMatchObject({ state: 'invalid', reason: 'no_mx', mxFound: false });
    const v2 = new LocalVerifier({ resolveMx: async () => { throw new Error('ENOTFOUND'); } });
    expect(await v2.verify('x@example.com')).toMatchObject({ state: 'invalid', reason: 'no_mx', mxFound: false });
  });
  it('never returns valid: MX present gives risky', async () => {
    const resolveMx = vi.fn().mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
    const v = new LocalVerifier({ resolveMx });
    const r = await v.verify('x@example.com');
    expect(r).toMatchObject({ state: 'risky', provider: 'local', mxFound: true, disposable: false });
    expect(r.state).not.toBe('valid');
    expect(resolveMx).toHaveBeenCalledWith('example.com');
  });
});

describe('ZeroBounceVerifier', () => {
  const cases: [string, string][] = [
    ['valid', 'valid'], ['invalid', 'invalid'], ['spamtrap', 'invalid'], ['abuse', 'invalid'],
    ['do_not_mail', 'invalid'], ['catch-all', 'catchall'], ['unknown', 'risky'],
  ];
  for (const [status, state] of cases) {
    it(`maps ${status} -> ${state}`, async () => {
      const fetch = vi.fn().mockImplementation(async () => json({ status, sub_status: '', mx_found: 'true' }));
      const onCost = vi.fn();
      const v = new ZeroBounceVerifier({ apiKey: 'zb', fetch, onCost });
      const r = await v.verify('a@b.com');
      expect(r.state).toBe(state);
      expect(r.provider).toBe('zerobounce');
      expect(r.mxFound).toBe(true);
      const url = new URL(fetch.mock.calls[0][0]);
      expect(url.origin + url.pathname).toBe('https://api.zerobounce.net/v2/validate');
      expect(url.searchParams.get('api_key')).toBe('zb');
      expect(url.searchParams.get('email')).toBe('a@b.com');
      expect(onCost).toHaveBeenCalledWith({ adapter: 'verifier:zerobounce', units: 1, usd: 0.008 });
    });
  }
  it('retries on 429 with injected sleep', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({ status: 'valid' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const v = new ZeroBounceVerifier({ apiKey: 'zb', fetch, sleep });
    expect((await v.verify('a@b.com')).state).toBe('valid');
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('NeverBounceVerifier', () => {
  const cases: [string, string][] = [
    ['valid', 'valid'], ['invalid', 'invalid'], ['disposable', 'invalid'], ['catchall', 'catchall'], ['unknown', 'risky'],
  ];
  for (const [result, state] of cases) {
    it(`maps ${result} -> ${state}`, async () => {
      const fetch = vi.fn().mockImplementation(async () => json({ status: 'success', result, flags: ['has_dns_mx'] }));
      const onCost = vi.fn();
      const v = new NeverBounceVerifier({ apiKey: 'nb', fetch, onCost });
      const r = await v.verify('a@b.com');
      expect(r.state).toBe(state);
      expect(r.provider).toBe('neverbounce');
      const url = new URL(fetch.mock.calls[0][0]);
      expect(url.origin + url.pathname).toBe('https://api.neverbounce.com/v4/single/check');
      expect(url.searchParams.get('key')).toBe('nb');
      expect(url.searchParams.get('email')).toBe('a@b.com');
      expect(onCost).toHaveBeenCalledWith({ adapter: 'verifier:neverbounce', units: 1, usd: 0.008 });
      if (result === 'disposable') expect(r.disposable).toBe(true);
    });
  }
  it('throws on an API error status', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ status: 'auth_failure', message: 'bad key' }));
    const v = new NeverBounceVerifier({ apiKey: 'nb', fetch });
    await expect(v.verify('a@b.com')).rejects.toThrow(/auth_failure/);
  });
});

describe('FakeVerifier', () => {
  it('applies the documented rules', async () => {
    const v = new FakeVerifier({ validDomains: ['good.example'], invalidEmails: ['bad@good.example'], catchallDomains: ['all.example'] });
    expect((await v.verify('a@shop.valid.test')).state).toBe('valid');
    expect((await v.verify('a@good.example')).state).toBe('valid');
    expect((await v.verify('bad@good.example')).state).toBe('invalid');
    expect((await v.verify('a@x.invalid.test')).state).toBe('invalid');
    expect((await v.verify('a@x.catchall.test')).state).toBe('catchall');
    expect((await v.verify('a@all.example')).state).toBe('catchall');
    expect((await v.verify('a@other.example')).state).toBe('risky');
  });
});

describe('ChainVerifier', () => {
  it('stops at local invalid without calling the provider', async () => {
    const provider = new FakeVerifier();
    const spy = vi.spyOn(provider, 'verify');
    const chain = new ChainVerifier(new LocalVerifier({ resolveMx: async () => [] }), provider);
    const r = await chain.verify('a@shop.valid.test');
    expect(r.state).toBe('invalid');
    expect(spy).not.toHaveBeenCalled();
  });
  it('asks the provider when local is risky, carrying mxFound', async () => {
    const provider = new FakeVerifier();
    const chain = new ChainVerifier(new LocalVerifier({ resolveMx: async () => [{ exchange: 'mx', priority: 1 }] }), provider);
    const r = await chain.verify('a@shop.valid.test');
    expect(r).toMatchObject({ state: 'valid', provider: 'fake', mxFound: true });
    expect(chain.costPerCheckUsd).toBe(0);
  });
  it('returns the local result when no provider', async () => {
    const chain = new ChainVerifier(new LocalVerifier({ resolveMx: async () => [{ exchange: 'mx', priority: 1 }] }), null);
    expect((await chain.verify('a@shop.valid.test')).state).toBe('risky');
  });
});
