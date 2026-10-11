import * as React from 'react';
import { Inbox, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted-fg', className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}

export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center gap-2 p-6 text-sm text-muted-fg', className)}>
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ title, description, action, icon, className }: { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center', className)}>
      <div className="text-muted-fg">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="max-w-sm text-xs text-muted-fg">{description}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-critical bg-critical-bg p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
      <div className="flex-1">
        <div className="font-medium">Request failed</div>
        <div className="text-muted-fg">{msg}</div>
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
export function QueryState<T>({ query, empty, children }: { query: { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; empty?: React.ReactNode | ((d: T) => boolean); children: (data: T) => React.ReactNode }) {
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return <Loading />;
  const isEmpty = Array.isArray(query.data) ? query.data.length === 0 : typeof empty === 'function' ? empty(query.data) : false;
  if (isEmpty) return typeof empty === 'function' || empty === undefined ? <EmptyState title="Nothing here yet" /> : <>{empty}</>;
  return <>{children(query.data)}</>;
}

export function Note({ children, tone = 'info', className }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'critical'; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-xs',
        tone === 'info' && 'bg-accent border-transparent',
        tone === 'warning' && 'bg-warning-bg border-transparent text-fg',
        tone === 'critical' && 'bg-critical-bg border-critical',
        className,
      )}
    >
      {children}
    </div>
  );
}
