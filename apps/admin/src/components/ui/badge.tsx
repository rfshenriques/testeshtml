import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** The only five status tones the console uses. */
export type Tone = 'good' | 'warning' | 'blocked' | 'neutral' | 'info';

const TONE_CHIP: Record<Tone, string> = {
  good: 'bg-good-bg text-good-fg',
  warning: 'bg-warn-bg text-warn-fg',
  blocked: 'bg-bad-bg text-bad-fg',
  neutral: 'bg-neutral-bg text-neutral-fg',
  info: 'bg-info-bg text-info-fg',
};
const TONE_DOT: Record<Tone, string> = {
  good: 'bg-good-dot',
  warning: 'bg-warn-dot',
  blocked: 'bg-bad-dot',
  neutral: 'bg-neutral-dot',
  info: 'bg-info-dot',
};

export const badgeVariants = cva('inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      good: TONE_CHIP.good,
      warning: TONE_CHIP.warning,
      blocked: TONE_CHIP.blocked,
      neutral: TONE_CHIP.neutral,
      info: TONE_CHIP.info,
      outline: 'border bg-transparent text-muted-fg',
      /* legacy aliases */
      default: TONE_CHIP.neutral,
      primary: TONE_CHIP.info,
      success: TONE_CHIP.good,
      critical: TONE_CHIP.blocked,
    },
  },
  defaultVariants: { variant: 'neutral' },
});

/** Tinted chip: pale background + dark text of the same hue. Use at most one per table row. */
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** 8px status dot. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', TONE_DOT[tone], className)} aria-hidden />;
}

/** Dot + plain text: the default way to show a status inside tables and key/value lists. */
export function DotLabel({ tone, children, className, muted, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone: Tone; children: React.ReactNode; className?: string; muted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap', muted && 'text-muted-fg', className)} data-tone={tone} {...rest}>
      <StatusDot tone={tone} />
      <span>{children}</span>
    </span>
  );
}

const STAGE_TONE: Record<string, Tone> = {
  won: 'good',
  replied: 'good',
  contacted: 'info',
  quoted: 'info',
  generated: 'info',
  profiled: 'info',
  enriched: 'neutral',
  qualified: 'neutral',
  discovered: 'neutral',
  lost: 'neutral',
  excluded: 'neutral',
  suppressed: 'blocked',
  manual_review: 'warning',
};
export const stageTone = (stage: string): Tone => STAGE_TONE[stage] ?? 'neutral';

/** Pipeline stage as dot + text (never a badge). */
export function StageLabel({ stage, className }: { stage: string; className?: string }) {
  return (
    <DotLabel tone={stageTone(stage)} className={className} data-testid="stage-label">
      {stage.replace(/_/g, ' ')}
    </DotLabel>
  );
}

export const gateTone = (gate: string): Tone => (gate === 'clear' ? 'good' : gate === 'blocked' ? 'blocked' : 'warning');

/** Legal gate as dot + "clear / blocked / pending". */
export function GateLabel({ gate, reason, className }: { gate: string; reason?: string | null; className?: string }) {
  return (
    <DotLabel tone={gateTone(gate)} title={reason ?? undefined} className={className}>
      {gate}
    </DotLabel>
  );
}

const GOOD = ['active', 'running', 'ok', 'done', 'valid', 'sent', 'delivered', 'approved', 'complete', 'handled', 'resolved', 'interested'];
const WARN = ['paused', 'warming', 'pending', 'searching', 'risky', 'queued', 'degraded', 'catchall', 'unverified', 'draft', 'scheduled', 'open', 'not_interested', 'later'];
const BAD = ['burned', 'halted', 'failed', 'invalid', 'bounced', 'complained', 'blocked', 'rejected', 'cancelled', 'hostile', 'unsubscribe', 'suppressed'];
export const statusTone = (status: string): Tone => (GOOD.includes(status) ? 'good' : WARN.includes(status) ? 'warning' : BAD.includes(status) ? 'blocked' : 'neutral');

/** Generic status chip (one per row at most). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={statusTone(status)} className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

/** Generic status as dot + text, for secondary positions where a chip would be too loud. */
export function StatusLabel({ status, className, muted }: { status: string; className?: string; muted?: boolean }) {
  return (
    <DotLabel tone={statusTone(status)} className={className} muted={muted}>
      {status.replace(/_/g, ' ')}
    </DotLabel>
  );
}

export function VerificationBadge({ state }: { state: string }) {
  return <StatusBadge status={state} />;
}

/* Backwards-compatible names. Both now render dot + text. */
export const StageBadge = StageLabel;
export const GateBadge = GateLabel;
