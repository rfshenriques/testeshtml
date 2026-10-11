import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ScoreBreakdownView } from './ScoreBreakdown';

afterEach(cleanup);

describe('ScoreBreakdownView', () => {
  it('renders each component with its weight, contribution and explanation', () => {
    render(
      <ScoreBreakdownView
        breakdown={{
          contactability: 0.75,
          revenueProxy: 0.6,
          digitalGap: 1,
          qualitySignal: 0.5,
          competitivePressure: 0.4,
          score: 0.68,
          weights: { contactability: 0.3, revenueProxy: 0.25, digitalGap: 0.2, qualitySignal: 0.15, competitivePressure: 0.1 },
          inputs: { websiteStatus: 'none', rating: 4.3 },
          hardExcluded: false,
          hardExcludeReason: null,
        }}
      />,
    );
    expect(screen.getByText('0.68')).toBeTruthy();
    expect(screen.getByText('Contactability')).toBeTruthy();
    expect(screen.getByText('Digital gap')).toBeTruthy();
    expect(screen.getByText(/role-generic verified/)).toBeTruthy();
    expect(screen.getByText(/0\.75 × 0\.30/)).toBeTruthy();
    expect(screen.getByText('0.225')).toBeTruthy();
    expect(screen.getByText(/same-type businesses in the same tile/)).toBeTruthy();
  });

  it('explains hard exclusion', () => {
    render(
      <ScoreBreakdownView
        breakdown={{
          contactability: 0, revenueProxy: 0, digitalGap: 0, qualitySignal: 0, competitivePressure: 0, score: 0,
          weights: { contactability: 0.3, revenueProxy: 0.25, digitalGap: 0.2, qualitySignal: 0.15, competitivePressure: 0.1 },
          inputs: {}, hardExcluded: true, hardExcludeReason: 'businessStatus CLOSED_PERMANENTLY',
        }}
      />,
    );
    expect(screen.getByText(/businessStatus CLOSED_PERMANENTLY/)).toBeTruthy();
  });

  it('shows an empty state without a breakdown', () => {
    render(<ScoreBreakdownView breakdown={null} />);
    expect(screen.getByTestId('score-breakdown-empty')).toBeTruthy();
  });
});
