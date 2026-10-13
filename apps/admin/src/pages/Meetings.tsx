/**
 * Meetings: calls booked by leads (from outreach emails and proposal pages) and demonstration bookings made on
 * mockups. Upcoming first; the operator marks outcomes, cancels, or resends the confirmation.
 */
import * as React from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtDate, relTime } from '@/lib/utils';
import { PageHeader, Section, Button, DotLabel, EmptyState, ErrorState, Loading, Table, THead, TBody, TR, TH, TD, CellSub, SegmentedControl, ConfirmDialog } from '@/components/ui';
import type { Meeting, MeetingStatus } from '@/lib/types';

const TONE: Record<MeetingStatus, 'good' | 'warning' | 'blocked' | 'neutral' | 'info'> = { scheduled: 'info', confirmed: 'good', cancelled: 'neutral', completed: 'good', no_show: 'warning' };
const LABEL: Record<MeetingStatus, string> = { scheduled: 'Scheduled', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No show' };

export function MeetingStatusLabel({ status }: { status: MeetingStatus }) {
  return <DotLabel tone={TONE[status] ?? 'neutral'}>{LABEL[status] ?? status}</DotLabel>;
}

export function whenInZone(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  } catch {
    return fmtDate(iso);
  }
}

export function MeetingsPage() {
  const qc = useQueryClient();
  const [view, setView] = React.useState<'upcoming' | 'all'>('upcoming');
  const q = useQuery({ queryKey: [...keys.meetings, view], queryFn: () => api.meetings.list(view === 'upcoming'), refetchInterval: 60_000 });
  const availability = useQuery({ queryKey: keys.availability, queryFn: api.scheduling.availability, staleTime: 5 * 60_000, meta: { silent: true } });
  const tz = availability.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.meetings });
  const [cancel, setCancel] = React.useState<Meeting | null>(null);
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'complete' | 'noShow' | 'resend' }): Promise<unknown> => (action === 'complete' ? api.meetings.complete(id) : action === 'noShow' ? api.meetings.noShow(id) : api.meetings.resend(id)),
    onSuccess: (_r, v) => { toast.success(v.action === 'resend' ? 'Confirmation resent' : 'Outcome saved'); refresh(); },
  });
  const doCancel = useMutation({ mutationFn: (m: Meeting) => api.meetings.cancel(m.id, 'cancelled by operator'), onSuccess: () => { toast.success('Meeting cancelled', 'The attendee has been emailed.'); setCancel(null); refresh(); } });

  const rows = q.data ?? [];
  const calls = rows.filter((m) => m.kind === 'agency_call');
  const demos = rows.filter((m) => m.kind === 'mockup_demo');

  return (
    <>
      <PageHeader
        title="Meetings"
        description={`Calls booked through the links in outreach emails and proposals. Times shown in ${tz}.`}
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl aria-label="View" value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'all', label: 'All' }]} />
            <Link to="/scheduling" className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted/60">Availability</Link>
          </div>
        }
      />
      {q.isLoading ? (
        <Loading rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-8">
          <Section title="Calls with you" description="Confirmed means the attendee clicked the confirm link; reminders go out automatically on the schedule set under Availability.">
            {calls.length === 0 ? (
              <EmptyState icon={<CalendarCheck className="size-5" aria-hidden />} title={view === 'upcoming' ? 'No upcoming calls' : 'No calls yet'} description="Every outreach email and proposal carries a booking link. Bookings land here." />
            ) : (
              <Table>
                <THead>
                  <TR><TH>When</TH><TH>Who</TH><TH>Business</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR>
                </THead>
                <TBody>
                  {calls.map((m) => (
                    <TR key={m.id}>
                      <TD className="whitespace-nowrap">
                        <div className="font-medium tabular-nums">{whenInZone(m.startAt, tz)}</div>
                        <CellSub>{relTime(m.startAt)}{m.timezone !== tz ? ` · booked in ${m.timezone}` : ''}</CellSub>
                        <CellSub>{m.remindersSent.length === 0 ? 'no reminders sent yet' : m.remindersSent.map((r) => `${r.kind === 'confirm' ? 'confirm request' : 'reminder'} ${r.hoursBefore} h before`).join(' · ')}</CellSub>
                      </TD>
                      <TD>
                        <div>{m.name}</div>
                        <CellSub><a className="hover:underline" href={`mailto:${m.email}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ''}</CellSub>
                        {m.notes && <CellSub className="italic">“{m.notes}”</CellSub>}
                      </TD>
                      <TD>{m.lead ? <Link className="text-primary hover:underline" to={`/leads/${m.lead.id}`}>{m.lead.businessName}</Link> : '—'}{m.lead?.city && <CellSub>{m.lead.city}</CellSub>}</TD>
                      <TD className="whitespace-nowrap"><MeetingStatusLabel status={m.status} /><CellSub className="capitalize">via {m.source}</CellSub>{m.cancelReason && <CellSub>{m.cancelReason}</CellSub>}</TD>
                      <TD className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          {(m.status === 'scheduled' || m.status === 'confirmed') && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: m.id, action: 'resend' })}>Resend</Button>
                              {new Date(m.endAt) < new Date() && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => act.mutate({ id: m.id, action: 'complete' })}>Completed</Button>
                                  <Button size="sm" variant="outline" onClick={() => act.mutate({ id: m.id, action: 'noShow' })}>No show</Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" className="text-bad-fg" onClick={() => setCancel(m)}>Cancel</Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
          <Section title="Bookings made on mockups" description="Visitors who used the booking flow on a concept site. Demonstration only: nothing was sent to the business, but it shows the mockup is converting.">
            {demos.length === 0 ? (
              <p className="text-sm text-muted-fg">None yet.</p>
            ) : (
              <Table>
                <THead><TR><TH>When</TH><TH>Mockup</TH><TH>Visitor</TH><TH>Booked</TH></TR></THead>
                <TBody>
                  {demos.map((m) => (
                    <TR key={m.id}>
                      <TD className="tabular-nums">{whenInZone(m.startAt, m.timezone)}<CellSub>{m.timezone}</CellSub></TD>
                      <TD>{m.lead ? <Link className="inline-flex items-center gap-1 text-primary hover:underline" to={`/leads/${m.lead.id}`}>{m.lead.businessName} <ExternalLink className="size-3" aria-hidden /></Link> : '—'}</TD>
                      <TD>{m.name}<CellSub>{m.email}</CellSub></TD>
                      <TD>{relTime(m.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
        </div>
      )}
      <ConfirmDialog
        open={cancel !== null}
        onClose={() => setCancel(null)}
        onConfirm={async () => { if (cancel) await doCancel.mutateAsync(cancel); }}
        title={cancel ? `Cancel the call with ${cancel.name}?` : ''}
        confirmLabel="Cancel the call"
        destructive
        blastRadius={cancel ? <>The attendee receives a cancellation email with a link to pick another time; queued reminders are removed.</> : null}
      />
    </>
  );
}
