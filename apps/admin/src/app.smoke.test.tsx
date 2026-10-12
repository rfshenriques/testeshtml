import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query';
import { auth } from '@/lib/auth';
import { routes } from '@/routes';

/** Minimal API fixtures keyed by path prefix; enough to mount every screen without a backend. */
const economics = { totalUsd: 12.5, leads: 10, contacted: 4, replied: 1, won: 0, costPerLead: 1.25, costPerContacted: 3.125, costPerReply: 12.5, costPerWon: null };
const lead = {
  id: 'lead1', campaignId: 'c1', placeId: 'p1', businessName: 'Acme Dental', primaryType: 'dentist', vertical: 'dental', countryCode: 'IE', city: 'Dublin', phone: null,
  websiteStatus: 'none', websiteUrl: null, rating: 4.5, reviewCount: 40, score: 0.71, stage: 'quoted', legalGate: 'clear', legalGateReason: null, fallbackChannel: 'email', priority: 0,
  lastTouchAt: null, createdAt: '2026-10-01T00:00:00Z', primaryContact: { email: 'info@acme.ie', verification: 'valid', source: 'registry' }, previewUrl: null, quoteUrl: null,
};
const fixtures: Record<string, unknown> = {
  '/health': { status: 'ok', killSwitch: false, db: { ok: true }, redis: { ok: true }, queues: [], external: [], time: '' },
  '/admin/ops/alerts': [{ id: 'a1', severity: 'warning', kind: 'budget', message: 'Campaign at 90% budget', meta: null, acknowledgedAt: null, createdAt: '2026-10-10T00:00:00Z' }],
  '/admin/dashboard': {
    campaigns: { running: 1, total: 2, list: [{ id: 'c1', name: 'Dublin dentists', status: 'running', countryCode: 'IE', spendUsd: 12.5, budgetUsdCap: 50, leads: 10 }] },
    funnel: [{ stage: 'discovered', count: 10 }, { stage: 'qualified', count: 6 }],
    sends: { today: 3, cap: 10, perMailbox: [{ id: 'm1', address: 'anna@get-agency.com', status: 'warming', sentToday: 3, dailyCap: 5, warmupStage: 0 }] },
    replyQueue: 1, reviewQueue: 2, approvalQueue: 3, alerts: [], economics, viewsToday: 7,
  },
  '/admin/ops/overview': { killSwitch: false, queues: [{ name: 'discovery.tile', waiting: 1, active: 0, delayed: 0, failed: 0, completed: 5, paused: false }], costs: { byCategory: [{ category: 'places.search', usd: 10, units: 300 }], byCampaign: [{ campaignId: 'c1', usd: 10 }] }, quotas: [{ api: 'places', day: '2026-10-11', used: 300, cap: 5000 }], alerts: [], economics },
  '/admin/campaigns': [],
  '/admin/leads': { items: [lead], total: 1, nextCursor: null },
  '/admin/review': [],
  '/admin/generator/templates': [{ id: 'appointment', verticals: ['dental'], sections: ['hero'], colourSchemes: ['a', 'b', 'c'], typography: ['a', 'b'] }],
  '/admin/generator/builds': [],
  '/admin/outreach/approval-queue': [],
  '/admin/outreach/domains': [{ id: 'd1', domain: 'get-agency.com', status: 'warming', dmarcPolicy: 'none', createdAt: '2026-10-01T00:00:00Z', mailboxes: [{ id: 'm1', address: 'anna@get-agency.com', sendingDomainId: 'd1', sendingDomain: 'get-agency.com', dailyCap: 5, sentToday: 3, warmupStage: 0, warmupStartedAt: '2026-10-01T00:00:00Z', status: 'warming', lastSentAt: null, pauseReason: null, createdAt: '2026-10-01T00:00:00Z' }] }],
  '/admin/outreach/mailboxes': [],
  '/admin/inbox': [],
  '/admin/pricing': { currency: 'EUR', tiers: { starter: { buildFee: 690, monthly: 49, pages: 5, revisions: 2, updatesPerMonth: 0, label: 'Starter', nfcTags: 0 }, business: { buildFee: 1450, monthly: 99, pages: 10, revisions: 3, updatesPerMonth: 2, label: 'Business', nfcTags: 1 }, premium: { buildFee: 2900, monthly: 189, pages: 99, revisions: 5, updatesPerMonth: 4, label: 'Premium', nfcTags: 2 } }, addOns: { contentManagement: { monthly: 40, updatesIncluded: 2 }, maintenance: { monthly: 20 }, seoLocal: { setup: 300, monthly: 60 }, copywritingExtra: { perPage: 80 }, ecommerce: { setup: 900, monthly: 40 }, multilingual: { perLanguage: 250, monthly: 10 }, domainAndEmail: { setup: 60, monthly: 8 }, photography: { oneOff: 400 }, nfcTagExtra: { perTag: 15 } }, countryMultipliers: { IE: 1 }, currencyRates: { EUR: 1 } },
  '/admin/compliance/jurisdictions': [{ countryCode: 'DE', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 0, optOutHonourWindowHours: 72, defaultLanguageCode: 'de', defaultCurrency: 'EUR', notes: 'UWG §7', confirmedByCounsel: false }],
};

function mockFetch(url: string): Response {
  const path = url.split('?')[0]!;
  const key = Object.keys(fixtures).find((k) => path === k);
  if (!key) return new Response(JSON.stringify({ error: 'NOT_FOUND', message: `no fixture for ${path}` }), { status: 404 });
  return new Response(JSON.stringify(fixtures[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('console smoke', () => {
  beforeEach(() => {
    auth.setToken('t');
    vi.stubGlobal('fetch', vi.fn((u: string) => Promise.resolve(mockFetch(u))));
    // recharts + virtualizer need layout; jsdom has none.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the dashboard with the kill switch in the top bar and the 50/day ceiling', async () => {
    mount('/dashboard');
    await waitFor(() => expect(screen.getByText('Dublin dentists')).toBeTruthy());
    expect(screen.getByTestId('kill-switch').textContent).toMatch(/kill switch off/i);
    expect(screen.getAllByText(/ceiling 50\/mailbox/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Cost per lead')).toBeTruthy();
  });

  it('renders the compliance screen with prior-consent countries marked blocked and no delete control', async () => {
    mount('/compliance');
    await waitFor(() => expect(screen.getByText(/^Blocked \(consent\)/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('renders the leads table with a row and the outreach mailbox screen', async () => {
    mount('/leads');
    await waitFor(() => expect(screen.getByText('Acme Dental')).toBeTruthy());
    // stage is a status dot + plain text, not a badge
    const stage = screen.getByTestId('stage-label');
    expect(stage.textContent).toBe('quoted');
    expect(stage.getAttribute('data-tone')).toBe('info');
    expect(stage.querySelector('.rounded-full')).not.toBeNull();
    expect(stage.className).not.toMatch(/rounded-full/);
    cleanup();
    mount('/outreach?tab=mailboxes');
    await waitFor(() => expect(screen.getByText('anna@get-agency.com')).toBeTruthy());
    expect((screen.getByLabelText('Daily cap') as HTMLInputElement).max).toBe('50');
  });

  it('mounts every remaining screen without throwing', async () => {
    for (const p of ['/campaigns', '/review', '/generator', '/inbox', '/pricing', '/ops']) {
      mount(p);
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
      cleanup();
    }
  });
});
