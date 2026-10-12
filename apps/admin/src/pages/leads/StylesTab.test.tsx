import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query';
import { auth } from '@/lib/auth';
import type { SiteVariants } from '@/lib/types';
import { StylesGrid } from './StylesTab';

const FAMILIES = ['hospitality', 'appointment', 'trades', 'professional', 'retail', 'fitness'];
const variants: SiteVariants = {
  current: { templateId: 'appointment', colourScheme: 'b', typography: 'a' },
  brand: null,
  images: [{ url: 'https://img.example/1.jpg', alt: 'Shopfront', credit: 'Photo: J. Doe via Google', source: 'google_places' }],
  templates: FAMILIES.map((id) => ({ id, verticals: ['dental'], sections: ['hero', 'services'] })),
  colourSchemes: ['a', 'b', 'c', 'brand'],
  typography: ['a', 'b'],
};

/** IntersectionObserver stub: records observed elements; `fire()` marks them all visible. */
let observed: Element[] = [];
let callbacks: IntersectionObserverCallback[] = [];
class IO {
  cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) { this.cb = cb; callbacks.push(cb); }
  observe(el: Element) { observed.push(el); }
  unobserve() {}
  disconnect() {}
}
function fireIntersections() {
  for (const cb of callbacks) cb(observed.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry), {} as IntersectionObserver);
}

function mount(v: SiteVariants, onAdopt = vi.fn(() => Promise.resolve())) {
  const qc = createQueryClient();
  const r = render(
    <QueryClientProvider client={qc}>
      <StylesGrid leadId="lead1" businessName="Acme Dental" variants={v} typography="a" adopting={null} onAdopt={onAdopt} />
    </QueryClientProvider>,
  );
  return { ...r, onAdopt };
}

describe('StylesGrid', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    observed = [];
    callbacks = [];
    auth.setToken('tok');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('IntersectionObserver', IO);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 320 });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders one card per template family × colour scheme (24) and highlights the current combination', () => {
    mount(variants);
    const cards = screen.getAllByTestId('style-card');
    expect(cards).toHaveLength(24);
    expect(cards.filter((c) => c.dataset.scheme === 'brand')).toHaveLength(6);
    const current = cards.find((c) => c.dataset.template === 'appointment' && c.dataset.scheme === 'b')!;
    expect(within(current).getByText('Current')).toBeTruthy();
    const use = within(current).getByRole('button', { name: /use this style/i }) as HTMLButtonElement;
    expect(use.textContent).toBe('In use');
    expect(use.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing is built until a card scrolls into view
  });

  it("disables the 'From their photos' cards when the lead has no brand palette", () => {
    mount(variants);
    const brandCards = screen.getAllByTestId('style-card').filter((c) => c.dataset.scheme === 'brand');
    for (const card of brandCards) {
      expect(card.dataset.disabled).toBe('true');
      expect(card.getAttribute('aria-disabled')).toBe('true');
      expect((within(card).getByRole('button', { name: /use this style/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((within(card).getByRole('button', { name: /open full size/i }) as HTMLButtonElement).disabled).toBe(true);
      expect(within(card).getByText(/no palette could be derived/i)).toBeTruthy();
    }
    cleanup();
    mount({ ...variants, brand: { source: 'photos', primary: '#112233', accent: '#aabbcc', swatches: ['#112233'] } });
    const enabled = screen.getAllByTestId('style-card').filter((c) => c.dataset.scheme === 'brand');
    expect(enabled.every((c) => c.dataset.disabled === undefined)).toBe(true);
  });

  it("opens the confirm dialog from 'Use this style' and calls the rebuild handler with the combination", async () => {
    const { onAdopt } = mount(variants);
    const card = screen.getAllByTestId('style-card').find((c) => c.dataset.template === 'trades' && c.dataset.scheme === 'c')!;
    fireEvent.click(within(card).getByRole('button', { name: /use this style/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Rebuild and republish the mockup for Acme Dental with trades / c / a?' })).toBeTruthy();
    expect(within(dialog).getByText(/blast radius/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /rebuild & republish/i }));
    await waitFor(() => expect(onAdopt).toHaveBeenCalledWith({ templateId: 'trades', colourScheme: 'c', typography: 'a' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lazily fetches a variant with the bearer header once its card is in view and renders it in a scaled iframe', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(`<html><body>${url}</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } })));
    mount({ ...variants, templates: variants.templates.slice(0, 1), colourSchemes: ['a'] });
    expect(screen.getAllByTestId('style-card')).toHaveLength(1);
    fireIntersections();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin/leads/lead1/site/variant?template=hospitality&colourScheme=a&typography=a');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const frame = (await screen.findByTitle(/hospitality · Scheme A · Editorial thumbnail/)) as HTMLIFrameElement;
    expect(frame.getAttribute('srcdoc')).toContain('site/variant');
    expect(frame.style.transform).toBe('scale(0.25)'); // 320px card / 1280px page
  });
});
