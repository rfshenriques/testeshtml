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
  critical: 'var(--critical)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  seq: ['var(--seq-250)', 'var(--seq-350)', 'var(--seq-450)', 'var(--seq-550)', 'var(--seq-650)'],
};

export const axisProps = { tick: { fontSize: 11, fill: C.text }, axisLine: { stroke: C.grid }, tickLine: false as const };
export const tooltipStyle = { contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--fg)' }, labelStyle: { color: 'var(--fg)' }, itemStyle: { color: 'var(--fg)' }, cursor: { fill: 'var(--muted)', opacity: 0.5 } };

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-fg', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color, ...(i.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 6px)`, background: 'none' } : {}) }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bar that visually caps at `ceiling` with a hard stop line. */
export function CapBar({ value, cap, ceiling, label, className }: { value: number; cap: number; ceiling: number; label: string; className?: string }) {
  const pctValue = Math.min(100, (value / ceiling) * 100);
  const pctCap = Math.min(100, (cap / ceiling) * 100);
  const over = value >= cap && cap > 0;
  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <div className="w-44 truncate" title={label}>
        {label}
      </div>
      <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${label}: ${value} of ${cap} sent today; hard ceiling ${ceiling}`}>
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pctCap}%`, background: 'color-mix(in oklab, var(--primary) 18%, transparent)' }} aria-hidden />
        <div className={cn('absolute inset-y-0 left-0 rounded-sm', over ? 'bg-warning' : 'bg-primary')} style={{ width: `${pctValue}%` }} aria-hidden />
        <div className="absolute inset-y-0 w-0.5 bg-critical" style={{ left: 'calc(100% - 2px)' }} aria-hidden title={`Hard ceiling ${ceiling}`} />
      </div>
      <div className="w-20 text-right tabular-nums">
        {value}/{cap} <span className="text-muted-fg">({ceiling})</span>
      </div>
    </div>
  );
}

export function ChartBox({ title, children, right, className, height = 220 }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string; height?: number }) {
  return (
    <div className={className}>
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted-fg">{title}</div>
          {right}
        </div>
      )}
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </div>
  );
}
