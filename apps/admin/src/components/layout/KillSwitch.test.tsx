import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KillSwitchControl, KILL_PHRASE } from './KillSwitch';

function renderIt(engaged = false) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <KillSwitchControl engaged={engaged} />
    </QueryClientProvider>,
  );
}

describe('KillSwitchControl', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the state and keeps the engage button disabled until the phrase is typed', () => {
    renderIt(false);
    expect(screen.getByText(/kill switch: off/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /engage kill switch/i }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /^engage kill switch$/i });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    const input = dialog.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pause everything' } });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(input, { target: { value: KILL_PHRASE } });
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires acknowledgement before release', () => {
    renderIt(true);
    expect(screen.getByText(/engaged/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /release kill switch/i }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: /^release$/i });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm.hasAttribute('disabled')).toBe(false);
  });
});
