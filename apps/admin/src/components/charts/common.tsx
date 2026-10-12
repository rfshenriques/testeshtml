import * as React from 'react';
import { cn } from '@/lib/utils';

/** Chart colour roles resolved from CSS variables (light/dark aware). */
export const C = {
  s1: 'var(--series-1)',
  s2: 'var(--series-2)',
  s3: 'var(--series-3)',
  s4: 'var(--series-4)',
  s5: 'var(--series-5)',
  grid: 'var(--grid)',
  text: 'var(--muted-fg)',
  critical: 'var(--bad-dot)',
  warning: 'var(--warn-dot)',
  success: 'var(--good-dot)',
  muted: 'var(--neutral-dot)',
  seq: ['var(--seq-250)', 'var(--seq-350)', 'var(--seq-450)', 'var(--seq-550)', 'var(--seq-650)'],
};

/** 12px muted axis labels, no tick lines, hairline axis. */
export const axisProps = { tick: { fontSize: 12, fill: C.text, fontFamily: 'inherit' }, axisLine: { stroke: C.grid }, tickLine: false as const };
export const tooltipStyle = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '8px 12px' },
  labelStyle: { color: 'var(--muted-fg)', marginBottom: 4 },
  itemStyle: { color: 'var(--fg)', padding: 0 },
  cursor: { fill: 'var(--muted)', opacity: 0.6 },
};

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-fg', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={i.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 6px)` } : { background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Thin (8px) horizontal cap bar. The pale band is the current warmup cap, the solid fill is sent
 * today, the red tick is the hard ceiling the bar can never cross. Label "0 / 50" in tabular numbers.
 */
export function CapBar({ value, cap, ceiling, label, className, showCeiling = true }: { value: number; cap: number; ceiling: number; label: string; className?: string; showCeiling?: boolean }) {
  const pctValue = Math.min(100, (value / ceiling) * 100);
  const pctCap = Math.min(100, (cap / ceiling) * 100);
  const over = value >= cap && cap > 0;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {label && (
        <div className="w-48 shrink-0 truncate text-base" title={label}>
          {label}
        </div>
      )}
      <div className="relative h-2 flex-1 rounded-full bg-muted" role="img" aria-label={`${label || 'mailbox'}: ${value} of ${cap} sent today; hard ceiling ${ceiling}`}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pctCap}%`, background: 'color-mix(in oklab, var(--primary) 20%, transparent)' }} aria-hidden />
        <div className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-warn-dot' : 'bg-primary')} style={{ width: `${pctValue}%` }} aria-hidden />
        <div className="absolute -inset-y-1 right-0 w-0.5 rounded bg-bad-dot" aria-hidden title={`Hard ceiling ${ceiling}`} />
      </div>
      <div className="w-16 shrink-0 text-right text-sm tabular-nums">
        {value} / {cap}
      </div>
      {showCeiling && <div className="w-8 shrink-0 text-right text-xs text-muted-fg tabular-nums">{ceiling}</div>}
    </div>
  );
}

export function ChartBox({ title, children, right, className, height = 220 }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string; height?: number }) {
  return (
    <div className={className}>
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-muted-fg">{title}</div>
          {right}
        </div>
      )}
      <div style={{ height }} className="w-full text-xs">
        {children}
      </div>
    </div>
  );
}
