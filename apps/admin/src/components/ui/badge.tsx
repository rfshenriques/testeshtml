import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-transparent bg-muted text-fg',
      outline: 'bg-transparent',
      primary: 'border-transparent bg-accent text-primary',
      success: 'border-transparent bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success',
      warning: 'border-transparent bg-warning-bg text-warning',
      critical: 'border-transparent bg-critical-bg text-critical',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STAGE_VARIANT: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  won: 'success', replied: 'success', contacted: 'primary', quoted: 'primary', generated: 'primary',
  lost: 'default', excluded: 'default', suppressed: 'critical', manual_review: 'warning',
};
export function StageBadge({ stage }: { stage: string }) {
  return <Badge variant={STAGE_VARIANT[stage] ?? 'outline'}>{stage.replace(/_/g, ' ')}</Badge>;
}

export function GateBadge({ gate, reason }: { gate: string; reason?: string | null }) {
  const v = gate === 'clear' ? 'success' : gate === 'blocked' ? 'critical' : 'warning';
  return (
    <Badge variant={v} title={reason ?? undefined}>
      gate: {gate}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const v = ['active', 'running', 'ok', 'done', 'valid', 'sent', 'delivered', 'approved', 'complete'].includes(status)
    ? 'success'
    : ['paused', 'warming', 'pending', 'searching', 'risky', 'queued', 'degraded', 'catchall', 'unverified', 'draft'].includes(status)
      ? 'warning'
      : ['burned', 'halted', 'failed', 'invalid', 'bounced', 'complained', 'blocked', 'rejected', 'cancelled'].includes(status)
        ? 'critical'
        : 'outline';
  return <Badge variant={v}>{status.replace(/_/g, ' ')}</Badge>;
}

export function VerificationBadge({ state }: { state: string }) {
  return <StatusBadge status={state} />;
}
