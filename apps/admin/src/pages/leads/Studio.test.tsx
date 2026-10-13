import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query';
import { auth } from '@/lib/auth';
import { routes } from '@/routes';

const FAMILIES = ['hospitality', 'beauty', 'clinic', 'trades', 'automotive', 'professional', 'property', 'education', 'retail', 'fitness'];
const lead = {
  id: 'lead1', campaignId: 'c1', placeId: 'p1', businessName: 'Acme Dental', primaryType: 'dentist', vertical: 'dental', countryCode: 'IE', city: 'Dublin', phone: null,
  websiteStatus: 'none', websiteUrl: null, rating: 4.5, reviewCount: 40, score: 0.71, stage: 'quoted', legalGate: 'clear', legalGateReason: null, fallbackChannel: 'email', priority: 0,
  lastTouchAt: null, createdAt: '2026-10-01T00:00:00Z', primaryContact: null, previewUrl: 'http://preview.example/p/x', quoteUrl: null,
  scoreBreakdown: null, classification: null, websiteProbe: null, gateOverride: null, notes: null, lat: null, lng: null, priceLevel: null, businessStatus: null,
};
const detail = { lead, snapshot: null, contacts: [], site: null, quote: null, messages: [], replies: [], events: [], reviewItems: [], tasks: [], provisioning: null };
const variants = (brand: unknown) => ({
  current: { templateId: 'clinic', colourScheme: 'a', typography: 'a' },
  brand, images: [],
  templates: FAMILIES.map((id) => ({ id, label: id, concept: `${id} concept`, verticals: id === 'clinic' ? ['dental'] : ['x'], sections: ['hero'] })),
  colourSchemes: ['a', 'b', 'c', 'brand', 'brand2', 'brand3'],
  typography: ['a', 'b', 'c', 'd', 'e'],
});

function mockFetch(fixtures: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const path = url.split('?')[0]!;
    if (path.endsWith('/site/variant')) return Promise.resolve(new Response(`<!doctype html><title>v</title><p>${url}</p>`, { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const key = Object.keys(fixtures).find((k) => path === k);
    if (!key) return Promise.resolve(new Response(JSON.stringify({ error: 'NOT_FOUND', message: path }), { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(fixtures[key]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
}

function mount() {
  const router = createMemoryRouter(routes, { initialEntries: ['/leads/lead1/studio'] });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('design studio', () => {
  beforeEach(() => auth.setToken('t'));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lists every family with the recommended one marked, disables brand palettes without a brand, and previews the chosen combination', async () => {
    const fetchMock = mockFetch({ '/admin/leads/lead1': detail, '/admin/leads/lead1/site/variants': variants(null), '/admin/leads/lead1/site': { error: 'NOT_FOUND' } });
    vi.stubGlobal('fetch', fetchMock);
    mount();
    const families = await screen.findByRole('radiogroup', { name: /template family/i });
    expect(within(families).getAllByRole('radio')).toHaveLength(10);
    const clinic = within(families).getByRole('radio', { name: /clinic/i });
    expect(clinic.getAttribute('aria-checked')).toBe('true');
    expect(within(clinic).getByText('Recommended')).toBeTruthy();

    const palettes = screen.getByRole('radiogroup', { name: /colour palette/i });
    const brandRows = within(palettes).getAllByRole('radio').filter((r) => /their colours/i.test(r.textContent ?? ''));
    expect(brandRows).toHaveLength(3);
    for (const r of brandRows) expect((r as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByRole('radiogroup', { name: /typography/i })).getAllByRole('radio')).toHaveLength(5);

    // The preview iframe shows the variant for the current combination; choosing another family re-renders it.
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('template=clinic&colourScheme=a&typography=a'))).toBe(true));
    const apply = screen.getByRole('button', { name: /apply & republish/i }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(within(families).getByRole('radio', { name: /trades/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('template=trades&colourScheme=a&typography=a'))).toBe(true));
    expect(screen.getByText('Not applied')).toBeTruthy();
    expect(apply.disabled).toBe(false);
  });

  it('enables the brand palettes and shows the swatches when the lead has a palette', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/admin/leads/lead1': detail, '/admin/leads/lead1/site/variants': variants({ source: 'photos', primary: '#2a6f97', accent: '#e07a2f', heroBg: '#1b2a33', swatches: ['#2a6f97', '#e07a2f'] }), '/admin/leads/lead1/site': { error: 'NOT_FOUND' } }));
    mount();
    const palettes = await screen.findByRole('radiogroup', { name: /colour palette/i });
    const brandRows = within(palettes).getAllByRole('radio').filter((r) => /their colours/i.test(r.textContent ?? ''));
    for (const r of brandRows) expect((r as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText(/colours found in their photos/i).children).toHaveLength(3);
  });
});
