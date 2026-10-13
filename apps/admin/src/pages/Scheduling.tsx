/**
 * Availability for bookable calls: weekly hours in your zone, slot length, notice, horizon, a private iCal feed
 * whose events block slots, the notify address, and the reminder schedule (including the forced confirmation).
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { AvailabilitySchema, DAY_KEYS, type Availability, type DayKey } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { PageHeader, Section, Button, Input, Select, Field, Checkbox, Note, Loading, ErrorState } from '@/components/ui';

const DAY_LABEL: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const ZONES = ['Europe/Lisbon', 'Europe/London', 'Europe/Dublin', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Rome', 'Europe/Malta', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Stockholm', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Helsinki', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Africa/Lagos', 'Africa/Johannesburg', 'Australia/Sydney', 'UTC'];

export function SchedulingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.availability, queryFn: api.scheduling.availability });
  const slots = useQuery({ queryKey: [...keys.availability, 'slots'], queryFn: () => api.scheduling.slots(7), meta: { silent: true } });
  const [a, setA] = React.useState<Availability | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  React.useEffect(() => { if (q.data) setA(structuredClone(q.data)); }, [q.data]);
  const save = useMutation({
    mutationFn: (v: Availability) => api.scheduling.saveAvailability(v),
    onSuccess: () => { toast.success('Availability saved', 'Booking pages use it immediately.'); void qc.invalidateQueries({ queryKey: keys.availability }); },
  });
  const onSave = () => {
    if (!a) return;
    const r = AvailabilitySchema.safeParse({ ...a, busyFeedUrl: a.busyFeedUrl || null, notifyEmail: a.notifyEmail || null });
    if (!r.success) return setErrors(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    setErrors([]);
    save.mutate(r.data);
  };
  if (q.isLoading || !a) return <Loading rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const setHours = (day: DayKey, ranges: [string, string][]) => setA({ ...a, hours: { ...a.hours, [day]: ranges } });
  const zones = ZONES.includes(a.timezone) ? ZONES : [a.timezone, ...ZONES];

  return (
    <>
      <PageHeader title="Scheduling" description="When leads can book a call with you. Every outreach email and proposal links to a booking page that shows only these free times, minus anything already booked or busy in your calendar feed." actions={<Button loading={save.isPending} onClick={onSave}>Save availability</Button>} />
      {errors.length > 0 && <Note tone="critical" className="mb-6"><ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Note>}
      <div className="space-y-8">
        <Section title="Call" description="What the booking page offers.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Meeting title" htmlFor="av-title" className="sm:col-span-2"><Input id="av-title" value={a.meetingTitle} onChange={(e) => setA({ ...a, meetingTitle: e.target.value })} /></Field>
            <Field label="Slot length (minutes)" htmlFor="av-slot"><Input id="av-slot" type="number" min={10} max={120} step={5} value={a.slotMinutes} onChange={(e) => setA({ ...a, slotMinutes: Number(e.target.value) })} /></Field>
            <Field label="Buffer between calls (minutes)" htmlFor="av-buffer"><Input id="av-buffer" type="number" min={0} max={120} step={5} value={a.bufferMinutes} onChange={(e) => setA({ ...a, bufferMinutes: Number(e.target.value) })} /></Field>
            <Field label="Minimum notice (hours)" htmlFor="av-notice"><Input id="av-notice" type="number" min={0} max={168} value={a.minNoticeHours} onChange={(e) => setA({ ...a, minNoticeHours: Number(e.target.value) })} /></Field>
            <Field label="Bookable horizon (days)" htmlFor="av-horizon"><Input id="av-horizon" type="number" min={1} max={90} value={a.horizonDays} onChange={(e) => setA({ ...a, horizonDays: Number(e.target.value) })} /></Field>
            <Field label="Your time zone" htmlFor="av-tz" className="sm:col-span-2">
              <Select id="av-tz" value={a.timezone} onChange={(e) => setA({ ...a, timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select>
            </Field>
          </div>
        </Section>

        <Section title="Weekly hours" description="Times in your zone. Leave a day empty to block it. Add a second range for a lunch break.">
          <div className="divide-y">
            {DAY_KEYS.map((day) => {
              const ranges = a.hours[day] ?? [];
              return (
                <div key={day} className="grid gap-2 py-3 sm:grid-cols-[120px_1fr] sm:items-start">
                  <div className="pt-2 text-sm font-medium">{DAY_LABEL[day]}{ranges.length === 0 && <span className="ml-2 text-xs font-normal text-muted-fg">closed</span>}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ranges.map(([from, to], i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Input type="time" aria-label={`${DAY_LABEL[day]} range ${i + 1} from`} className="w-[7.5rem]" value={from} onChange={(e) => setHours(day, ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                        <span className="text-muted-fg">–</span>
                        <Input type="time" aria-label={`${DAY_LABEL[day]} range ${i + 1} to`} className="w-[7.5rem]" value={to} onChange={(e) => setHours(day, ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                        <Button size="sm" variant="ghost" aria-label={`Remove ${DAY_LABEL[day]} range ${i + 1}`} onClick={() => setHours(day, ranges.filter((_r, j) => j !== i))}><X className="size-3.5" aria-hidden /></Button>
                      </div>
                    ))}
                    {ranges.length < 3 && (
                      <Button size="sm" variant="outline" onClick={() => setHours(day, [...ranges, ranges.length ? ['14:00', '18:00'] : ['09:00', '17:00']])}><Plus className="size-3.5" aria-hidden /> {ranges.length ? 'Add range' : 'Open'}</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Your calendar" description="Paste the private iCal address of your calendar (Google Calendar: Settings → your calendar → “Secret address in iCal format”). Its events block slots; new bookings are emailed to the notify address with a calendar file so they land in your calendar.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Busy feed URL (iCal)" htmlFor="av-feed" hint="Fetched at most every 5 minutes. Recurring events count by their first occurrence only."><Input id="av-feed" type="url" placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics" value={a.busyFeedUrl ?? ''} onChange={(e) => setA({ ...a, busyFeedUrl: e.target.value || null })} /></Field>
            <Field label="Notify email" htmlFor="av-notify" hint="Receives new bookings and cancellations; also used as reply-to on attendee emails."><Input id="av-notify" type="email" placeholder="you@your-agency.com" value={a.notifyEmail ?? ''} onChange={(e) => setA({ ...a, notifyEmail: e.target.value || null })} /></Field>
          </div>
        </Section>

        <Section title="Reminders" description="Sent before each call. Tick “ask to confirm” on the one that should force a one-click confirmation; once the attendee confirms, later ones become plain reminders.">
          <div className="space-y-2">
            {a.reminders.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3">
                <Input type="number" min={1} max={720} aria-label={`Reminder ${i + 1} hours before`} className="w-24" value={r.hoursBefore} onChange={(e) => setA({ ...a, reminders: a.reminders.map((x, j) => (j === i ? { ...x, hoursBefore: Number(e.target.value) } : x)) })} />
                <span className="text-sm text-muted-fg">hours before{r.hoursBefore >= 24 ? ` (${Math.round((r.hoursBefore / 24) * 10) / 10} days)` : ''}</span>
                <Checkbox id={`rem-${i}`} label="ask to confirm" checked={r.confirm} onChange={(e) => setA({ ...a, reminders: a.reminders.map((x, j) => (j === i ? { ...x, confirm: e.target.checked } : x)) })} />
                <Button size="sm" variant="ghost" aria-label={`Remove reminder ${i + 1}`} onClick={() => setA({ ...a, reminders: a.reminders.filter((_x, j) => j !== i) })}><X className="size-3.5" aria-hidden /></Button>
              </div>
            ))}
            {a.reminders.length < 6 && <Button size="sm" variant="outline" onClick={() => setA({ ...a, reminders: [...a.reminders, { hoursBefore: 24, confirm: false }] })}><Plus className="size-3.5" aria-hidden /> Add reminder</Button>}
          </div>
        </Section>

        <Section title="Next free slots" description="What a lead opening a booking link right now would see (first 7 days, your zone).">
          {slots.isLoading ? <Loading /> : slots.data ? (
            slots.data.slots.length === 0 ? <p className="text-sm text-muted-fg">No free slots in the next 7 days.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {slots.data.slots.slice(0, 40).map((s) => (
                  <span key={s} className="rounded-md border bg-card px-2 py-1 text-xs tabular-nums">{new Intl.DateTimeFormat('en-GB', { timeZone: slots.data.timezone, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s))}</span>
                ))}
                {slots.data.slots.length > 40 && <span className="px-2 py-1 text-xs text-muted-fg">+{slots.data.slots.length - 40} more</span>}
              </div>
            )
          ) : null}
        </Section>
      </div>
    </>
  );
}
