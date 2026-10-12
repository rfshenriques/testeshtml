import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Rows 44px, 12px uppercase header, hover row background, numeric columns right aligned.
 * `bare` drops the outer border/radius for tables that sit inside a card.
 */
export function Table({ className, bare, wrapperClassName, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { bare?: boolean; wrapperClassName?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', bare ? '-mx-5 px-5' : 'rounded-lg border bg-card', wrapperClassName)}>
      <table className={cn('w-full caption-bottom text-base tabular-nums', className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_th]:t-label [&_th]:h-10 [&_th]:border-b [&_th]:px-3 [&_th]:text-left [&_th]:align-middle [&_th]:whitespace-nowrap first:[&_th]:pl-4 last:[&_th]:pr-4', className)} {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_td]:h-11 [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-middle [&_tr]:border-b last:[&_tr]:border-b-0 first:[&_td]:pl-4 last:[&_td]:pr-4', className)} {...props} />;
}
export function TR({ className, selected, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return <tr className={cn('transition-colors hover:bg-muted/60', selected && 'bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]', className)} aria-selected={selected} {...props} />;
}
export function TH({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <th scope="col" className={cn(numeric && 'text-right!', className)} {...props} />;
}
export function TD({ className, numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn(numeric && 'text-right tabular-nums', className)} {...props} />;
}

/** Secondary 13px muted line under a cell's main value. */
export function CellSub({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('truncate text-sm text-muted-fg', className)} {...props} />;
}

/** Label/value rows: 13px muted label, 15px value. */
export function KV({ items, className, dense }: { items: [React.ReactNode, React.ReactNode][]; className?: string; dense?: boolean }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-6', dense ? 'gap-y-1.5' : 'gap-y-2.5', className)}>
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="pt-px text-sm text-muted-fg">{k}</dt>
          <dd className="min-w-0 text-base break-words">{v ?? '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function JsonView({ value, className, collapsed, label = 'raw JSON' }: { value: unknown; className?: string; collapsed?: boolean; label?: string }) {
  const [open, setOpen] = React.useState(!collapsed);
  const text = React.useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div className={className}>
      {collapsed && (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? `Hide ${label}` : `Show ${label}`}
        </button>
      )}
      {open && <pre className="mt-1.5 max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">{text}</pre>}
    </div>
  );
}

/** 8px bar. */
export function Progress({ value, max, className, tone = 'primary', label }: { value: number; max: number; className?: string; tone?: 'primary' | 'warning' | 'critical' | 'success'; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full', tone === 'primary' && 'bg-primary', tone === 'warning' && 'bg-warn-dot', tone === 'critical' && 'bg-bad-dot', tone === 'success' && 'bg-good-dot')} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Previous / page n / Next, 13px. */
export function Pager({ page, pages, onPage, hasNext }: { page: number; pages?: number; onPage: (p: number) => void; hasNext?: boolean }) {
  const next = pages !== undefined ? page + 1 < pages : !!hasNext;
  return (
    <div className="flex items-center gap-3 text-sm text-muted-fg">
      <button type="button" className="rounded-md border bg-card px-3 py-1.5 font-medium text-fg hover:bg-muted disabled:opacity-50" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="tabular-nums">
        Page {page + 1}
        {pages !== undefined ? ` of ${Math.max(1, pages)}` : ''}
      </span>
      <button type="button" className="rounded-md border bg-card px-3 py-1.5 font-medium text-fg hover:bg-muted disabled:opacity-50" disabled={!next} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
