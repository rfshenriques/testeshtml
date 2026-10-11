import * as React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-md border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted/60 text-xs text-muted-fg [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium', className)} {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t', className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-muted/40', className)} {...props} />;
}
export function TH(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" {...props} />;
}
export function TD(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} />;
}

export function KV({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm', className)}>
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="text-muted-fg">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function JsonView({ value, className, collapsed }: { value: unknown; className?: string; collapsed?: boolean }) {
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
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide raw JSON' : 'Show raw JSON'}
        </button>
      )}
      {open && <pre className="mt-1 max-h-80 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-xs leading-relaxed">{text}</pre>}
    </div>
  );
}

export function Progress({ value, max, className, tone = 'primary', label }: { value: number; max: number; className?: string; tone?: 'primary' | 'warning' | 'critical' | 'success'; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full', tone === 'primary' && 'bg-primary', tone === 'warning' && 'bg-warning', tone === 'critical' && 'bg-critical', tone === 'success' && 'bg-success')} style={{ width: `${pct}%` }} />
    </div>
  );
}
