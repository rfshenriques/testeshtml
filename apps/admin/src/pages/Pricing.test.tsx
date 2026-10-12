import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query';
import { auth } from '@/lib/auth';
import { buildAddOns, QuotePreviewTool } from './Pricing';

const computation = {
  currency: 'EUR', recommendedTier: 'business', multiplier: 1, reasoning: ['vertical dental → business'],
  tiers: {
    starter: { buildFee: 690, monthly: 49, lineItems: [{ label: 'Starter site', oneOff: 690, monthly: 49 }] },
    business: { buildFee: 1480, monthly: 99, lineItems: [{ label: 'Business site', oneOff: 1450, monthly: 99 }, { label: 'Google review + website NFC tags ×1 (included)', oneOff: 0, monthly: 0 }, { label: 'Extra NFC tags ×2', oneOff: 30, monthly: 0 }] },
    premium: { buildFee: 2930, monthly: 189, lineItems: [{ label: 'Premium site', oneOff: 2900, monthly: 189 }, { label: 'Google review + website NFC tags ×2 (included)', oneOff: 0, monthly: 0 }, { label: 'Extra NFC tags ×2', oneOff: 30, monthly: 0 }] },
  },
};

describe('buildAddOns', () => {
  it('repeats quantity add-ons once per unit and keeps boolean add-ons once', () => {
    expect(buildAddOns(new Set(['photography']), { nfcTagExtra: 2 })).toEqual(['photography', 'nfcTagExtra', 'nfcTagExtra']);
    expect(buildAddOns(new Set(), { nfcTagExtra: 0 })).toEqual([]);
    expect(buildAddOns(new Set(), { nfcTagExtra: -3 })).toEqual([]);
  });
});

describe('QuotePreviewTool NFC quantity', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    auth.setToken('tok');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(computation), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sends nfcTagExtra repeated N times in addOns and renders the NFC line items', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <QuotePreviewTool initialLeadId="lead1" compact />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText(/extra nfc tags \(qty\)/i), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('photography'));
    fireEvent.click(screen.getByRole('button', { name: /preview quote/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin/pricing/preview');
    expect(JSON.parse(init.body as string)).toEqual({ leadId: 'lead1', addOns: ['photography', 'nfcTagExtra', 'nfcTagExtra'] });
    expect(await screen.findByText(/Google review \+ website NFC tags ×1 \(included\)/)).toBeTruthy();
    expect(screen.getAllByText(/Extra NFC tags ×2/).length).toBe(2);
  });

  it('clamps the quantity to a non-negative integer', () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <QuotePreviewTool initialLeadId="lead1" compact />
      </QueryClientProvider>,
    );
    const qty = screen.getByLabelText(/extra nfc tags \(qty\)/i) as HTMLInputElement;
    fireEvent.change(qty, { target: { value: '-4' } });
    expect(qty.value).toBe('0');
    fireEvent.change(qty, { target: { value: '3.7' } });
    expect(qty.value).toBe('3');
  });
});
