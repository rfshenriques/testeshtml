import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, qs } from './api';
import { auth } from './auth';

describe('api client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    auth.setToken('secret-token-123');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the bearer token to admin requests', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ campaigns: { running: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const res = await api.dashboard.get();
    expect(res.campaigns.running).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin/dashboard');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token-123');
  });

  it('does not send the token to the public /health route', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    await api.health.get();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('clears the token and throws on 401', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: 'nope' }), { status: 401 }));
    await expect(api.dashboard.get()).rejects.toBeInstanceOf(ApiError);
    expect(auth.getToken()).toBeNull();
  });

  it('surfaces the API error body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'KILL_SWITCH', message: 'Kill switch engaged' }), { status: 403 }));
    const err = await api.leads.action('l1', 'enqueue_outreach').catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('KILL_SWITCH');
    expect((err as ApiError).message).toBe('Kill switch engaged');
  });

  it('serialises query strings and drops empty values', () => {
    expect(qs({ stage: 'quoted', minScore: 0.5, q: '', campaignId: undefined })).toBe('?stage=quoted&minScore=0.5');
  });
});
