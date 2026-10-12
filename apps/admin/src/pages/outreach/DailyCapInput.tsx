import * as React from 'react';
import { MAILBOX_DAILY_CEILING, WARMUP_SCHEDULE } from '@sitewright/shared-types';
import { clamp } from '@/lib/utils';
import { Button, Input } from '@/components/ui';

/**
 * Daily cap editor with a hard ceiling at MAILBOX_DAILY_CEILING (50). The input clamps on every
 * change and on blur; the ceiling is not configurable from the UI by design (spec §11.2, §20.3).
 */
export function DailyCapInput({ value, warmupStage, onSave, saving, id }: { value: number; warmupStage: number; onSave: (cap: number) => void; saving?: boolean; id: string }) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => setV(String(value)), [value]);
  const n = clamp(parseInt(v, 10) || 0, 0, MAILBOX_DAILY_CEILING);
  const scheduleCap = WARMUP_SCHEDULE[Math.min(warmupStage, WARMUP_SCHEDULE.length - 1)] ?? MAILBOX_DAILY_CEILING;
  const aboveWarmup = n > scheduleCap;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          aria-label="Daily cap"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAILBOX_DAILY_CEILING}
          className="no-spin h-8 w-16 px-2 text-sm"
          value={v}
          onChange={(e) => {
            const raw = parseInt(e.target.value, 10);
            setV(Number.isNaN(raw) ? '' : String(clamp(raw, 0, MAILBOX_DAILY_CEILING)));
          }}
          onBlur={() => setV(String(n))}
          aria-describedby={`${id}-ceiling`}
        />
        <span id={`${id}-ceiling`} className="text-sm whitespace-nowrap text-muted-fg tabular-nums">
          / {MAILBOX_DAILY_CEILING}
        </span>
        <Button size="sm" variant="outline" disabled={n === value || saving} loading={saving} onClick={() => onSave(n)}>
          Save
        </Button>
      </div>
      {aboveWarmup && (
        <span className="max-w-44 text-xs leading-4 text-warn-fg" role="status">
          Above the warmup schedule for week {warmupStage + 1} ({scheduleCap}/day); the server will enforce the schedule.
        </span>
      )}
    </div>
  );
}
