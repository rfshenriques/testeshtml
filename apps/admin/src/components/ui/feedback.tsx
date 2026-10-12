import * as React from 'react';
import { Inbox, Loader2, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted-fg', className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}

/** Skeleton rows the same height as real table rows (44px). */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('divide-y', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 px-4">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="ml-auto h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function Loading({ label = 'Loading…', className, rows }: { label?: string; className?: string; rows?: number }) {
  if (rows) return <SkeletonRows rows={rows} className={className} />;
  return (
    <div role="status" className={cn('flex items-center gap-2 p-6 text-sm text-muted-fg', className)}>
      <Spinner /> {label}
    </div>
  );
}

/** An icon, one sentence, one action. */
export function EmptyState({ title, description, action, icon, className }: { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-fg">{icon ?? <Inbox className="size-5" aria-hidden />}</div>
      <div className="text-base font-medium">{title}</div>
      {description && <div className="max-w-sm text-sm text-muted-fg">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad-dot" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Request failed</div>
        <div className="text-sm text-muted-fg break-words">{msg}</div>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Wraps the standard query states: loading, error, empty, data. */
export function QueryState<T>({ query, empty, children, loading }: { query: { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; empty?: React.ReactNode | ((d: T) => boolean); children: (data: T) => React.ReactNode; loading?: React.ReactNode }) {
  if (query.isLoading) return <>{loading ?? <Loading />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return <>{loading ?? <Loading />}</>;
  const isEmpty = Array.isArray(query.data) ? query.data.length === 0 : typeof empty === 'function' ? empty(query.data) : false;
  if (isEmpty) return typeof empty === 'function' || empty === undefined ? <EmptyState title="Nothing here yet" /> : <>{empty}</>;
  return <>{children(query.data)}</>;
}

/**
 * Quiet inline note. `info` is a neutral bordered box; `warning` and `critical` tint only the
 * left edge so a note never reads as a banner.
 */
export function Note({ children, tone = 'info', className }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'critical'; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border bg-card px-3.5 py-3 text-sm leading-relaxed text-fg',
        tone === 'warning' && 'border-l-2 border-l-warn-dot',
        tone === 'critical' && 'border-l-2 border-l-bad-dot',
        className,
      )}
    >
      {tone === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-muted-fg" aria-hidden /> : <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warn-dot' : 'text-bad-dot')} aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Collapsible explanation ("Why this limit"). Keeps the message, does not shout it. */
export function Disclosure({ summary, children, className, defaultOpen }: { summary: React.ReactNode; children: React.ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cn('group text-sm', className)} open={defaultOpen}>
      <summary className="inline-flex cursor-pointer items-center gap-1 rounded text-sm font-medium text-muted-fg select-none hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        {summary}
      </summary>
      <div className="mt-2 max-w-prose pl-5 leading-relaxed text-muted-fg">{children}</div>
    </details>
  );
}
