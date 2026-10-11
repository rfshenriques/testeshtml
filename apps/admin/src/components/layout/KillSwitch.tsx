import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OctagonX, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button, ConfirmDialog, Textarea, Field } from '@/components/ui';
import { cn } from '@/lib/utils';

export const KILL_PHRASE = 'PAUSE EVERYTHING';

export function KillSwitchControl({ engaged, unknown, compact }: { engaged: boolean; unknown?: boolean; compact?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState<null | 'engage' | 'release'>(null);
  const [reason, setReason] = React.useState('');
  const mut = useMutation({
    mutationFn: (next: boolean) => api.ops.killSwitch(next, reason.trim() || undefined),
    onSuccess: (r) => {
      toast[r.engaged ? 'error' : 'success'](r.engaged ? 'Kill switch ENGAGED' : 'Kill switch released', r.engaged ? 'All sending and spending is paused.' : 'Workers resume on their next tick.');
      setOpen(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['health'] });
      void qc.invalidateQueries({ queryKey: ['ops'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className={cn('flex items-center gap-2 rounded-md border px-2 py-1', engaged ? 'border-critical bg-critical-bg' : 'bg-card')} data-testid="kill-switch">
      <span className="flex items-center gap-1.5 text-xs font-semibold" aria-live="polite">
        <span className={cn('inline-block size-2 rounded-full', unknown ? 'bg-muted-fg' : engaged ? 'bg-critical animate-pulse' : 'bg-success')} aria-hidden />
        {unknown ? 'Kill switch: unknown' : engaged ? 'KILL SWITCH ENGAGED' : 'Kill switch: off'}
      </span>
      {engaged ? (
        <Button size="sm" variant="outline" onClick={() => setOpen('release')}>
          <Power className="size-3.5" aria-hidden /> {compact ? 'Release' : 'Release kill switch'}
        </Button>
      ) : (
        <Button size="sm" variant="destructive" onClick={() => setOpen('engage')}>
          <OctagonX className="size-3.5" aria-hidden /> {compact ? 'Engage' : 'Engage kill switch'}
        </Button>
      )}
      <ConfirmDialog
        open={open === 'engage'}
        onClose={() => setOpen(null)}
        onConfirm={() => mut.mutateAsync(true)}
        title="Engage the kill switch"
        destructive
        confirmLabel="Engage kill switch"
        typeToConfirm={KILL_PHRASE}
        loading={mut.isPending}
        blastRadius={
          <>
            Every queue stops consuming: no discovery, enrichment, generation, <strong>no outreach sends</strong>, no billable external calls. Scheduled messages stay queued and are not lost. Public preview and
            unsubscribe endpoints keep working.
          </>
        }
      >
        <Field label="Reason (logged to the audit trail)" htmlFor="kill-reason">
          <Textarea id="kill-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. complaint spike on domain X" />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'release'}
        onClose={() => setOpen(null)}
        onConfirm={() => mut.mutateAsync(false)}
        title="Release the kill switch"
        confirmLabel="Release"
        acknowledge="I have checked the alerts and the reason the switch was engaged is resolved."
        loading={mut.isPending}
        blastRadius={<>All paused workers resume. Any queued outreach messages that are still within their send window will go out on the next scheduler tick, subject to the per-mailbox daily cap.</>}
      />
    </div>
  );
}
