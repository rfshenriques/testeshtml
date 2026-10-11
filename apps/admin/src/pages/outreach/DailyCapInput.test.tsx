import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DailyCapInput } from './DailyCapInput';

afterEach(cleanup);

describe('DailyCapInput', () => {
  it('clamps any value above 50 to the ceiling and never saves more than 50', () => {
    const onSave = vi.fn();
    render(<DailyCapInput id="cap" value={20} warmupStage={5} onSave={onSave} />);
    const input = screen.getByLabelText('Daily cap') as HTMLInputElement;
    expect(input.max).toBe('50');
    fireEvent.change(input, { target: { value: '120' } });
    expect(input.value).toBe('50');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(50);
  });

  it('clamps negatives to zero and warns when above the warmup schedule', () => {
    const onSave = vi.fn();
    render(<DailyCapInput id="cap" value={5} warmupStage={0} onSave={onSave} />);
    const input = screen.getByLabelText('Daily cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-3' } });
    expect(input.value).toBe('0');
    fireEvent.change(input, { target: { value: '30' } });
    expect(screen.getByRole('status').textContent).toMatch(/week 1 \(5\/day\)/);
  });
});
