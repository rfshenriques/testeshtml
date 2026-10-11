import type { ScoreBreakdown as SB } from '@/lib/types';
import { JsonView } from '@/components/ui';
import { Note } from '@/components/ui';

/** Component explanations from spec §6.3; the UI must explain every automated decision. */
export const SCORE_COMPONENTS: { key: keyof SB['weights']; label: string; explain: string }[] = [
  { key: 'contactability', label: 'Contactability', explain: '1.0 named verified email · 0.75 role-generic verified (info@, contact@) · 0.4 unverified · 0.15 phone only · 0 nothing.' },
  { key: 'revenueProxy', label: 'Revenue proxy', explain: 'Blend of place-type value tier (A=1.0, B=0.6, C=0.35), Google priceLevel where present, and log-scaled review count.' },
  { key: 'digitalGap', label: 'Digital gap', explain: 'How absent the web presence is: none=1.0 · broken=0.9 · parked=0.85 · social_only=0.75 · http_only=0.4.' },
  { key: 'qualitySignal', label: 'Quality signal', explain: 'Alive and cared-about: rating ≥ 4.0 with ≥ 20 reviews → 1.0, sliding to 0 below rating 3.0 or < 3 reviews. Non-operational status is a hard exclude, not a penalty.' },
  { key: 'competitivePressure', label: 'Competitive pressure', explain: 'Share of same-type businesses in the same tile that DO have a live website. Higher share = stronger, verifiable pitch.' },
];

export function ScoreBreakdownView({ breakdown, score }: { breakdown: SB | null | undefined; score?: number | null }) {
  if (!breakdown) {
    return (
      <div className="text-sm text-muted-fg" data-testid="score-breakdown-empty">
        No score breakdown yet — the lead has not been through qualification.{score != null && ` Current score ${score.toFixed(2)}.`}
      </div>
    );
  }
  const rows = SCORE_COMPONENTS.map((c) => {
    const value = Number(breakdown[c.key] ?? 0);
    const weight = Number(breakdown.weights?.[c.key] ?? 0);
    return { ...c, value, weight, contribution: value * weight };
  });
  const total = rows.reduce((s, r) => s + r.contribution, 0);
  return (
    <div className="space-y-3" data-testid="score-breakdown">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{Number(breakdown.score ?? total).toFixed(2)}</span>
        <span className="text-xs text-muted-fg">= Σ component × weight (weights sum to {rows.reduce((s, r) => s + r.weight, 0).toFixed(2)})</span>
      </div>
      {breakdown.hardExcluded && (
        <Note tone="critical">
          <strong>Hard excluded:</strong> {breakdown.hardExcludeReason ?? 'no reason recorded'}. The score is informational; this lead will not progress.
        </Note>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="rounded-md border p-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="font-mono text-xs tabular-nums">
                {r.value.toFixed(2)} × {r.weight.toFixed(2)} = <strong>{r.contribution.toFixed(3)}</strong>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, r.value * 100))}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-fg">{r.explain}</p>
          </li>
        ))}
      </ul>
      {breakdown.inputs && Object.keys(breakdown.inputs).length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-fg">Inputs used</div>
          <JsonView value={breakdown.inputs} collapsed />
        </div>
      )}
    </div>
  );
}
