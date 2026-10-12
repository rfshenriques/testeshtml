import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MAILBOX_DAILY_CEILING, WARMUP_SCHEDULE, WARMUP_REAL_SHARE, MAX_TOUCHES_PER_BUSINESS, SequenceConfigSchema, type SequenceStep } from '@sitewright/shared-types';
import { X, Pause, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtDay, fmtDate, fmtPct, fmtNum, relTime, cn } from '@/lib/utils';
import { PageHeader, QueryState, Section, Tabs, TabsList, TabsTrigger, TabsContent, Button, Input, Select, Field, StatusLabel, StageLabel, GateLabel, StatTile, Note, Disclosure, EmptyState, Table, THead, TBody, TR, TH, TD, CellSub, ConfirmDialog, Dialog, Loading, ErrorState, SegmentedControl } from '@/components/ui';
import { C, axisProps, tooltipStyle, CapBar, ChartBox, Legend } from '@/components/charts/common';
import { DailyCapInput } from './DailyCapInput';
import type { ApprovalItem, MailboxWithReputation, ReputationSeries } from '@/lib/types';

const TABS = ['sequence', 'mailboxes', 'reputation', 'schedule', 'approvals'] as const;

export function OutreachPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? sp.get('tab')! : 'mailboxes';
  const approvals = useQuery({ queryKey: [...keys.outreach, 'approval-queue'], queryFn: api.outreach.approvalQueue, refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title="Outreach" description="Sending domains, mailboxes, warmup, reputation guardrails and the approval queue." />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList aria-label="Outreach sections">
          <TabsTrigger value="mailboxes">Domains & mailboxes</TabsTrigger>
          <TabsTrigger value="sequence">Sequence</TabsTrigger>
          <TabsTrigger value="reputation">Reputation</TabsTrigger>
          <TabsTrigger value="schedule">Schedule & capacity</TabsTrigger>
          <TabsTrigger value="approvals" badge={approvals.data?.length}>
            Approval queue
          </TabsTrigger>
        </TabsList>
        <TabsContent value="mailboxes">
          <Mailboxes />
        </TabsContent>
        <TabsContent value="sequence">
          <SequenceEditor />
        </TabsContent>
        <TabsContent value="reputation">
          <Reputation />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleCapacity />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalQueue />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- Sequence ---------------- */
const KINDS: SequenceStep['kind'][] = ['opener', 'nudge', 'quote', 'closeout'];

function SequenceEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...keys.outreach, 'sequence'], queryFn: api.outreach.sequence });
  const [steps, setSteps] = React.useState<SequenceStep[] | null>(null);
  React.useEffect(() => {
    if (q.data) setSteps(q.data);
  }, [q.data]);
  const [err, setErr] = React.useState<string | null>(null);
  const save = useMutation({
    mutationFn: (s: SequenceStep[]) => api.outreach.saveSequence(s),
    onSuccess: () => {
      toast.success('Sequence saved');
      void qc.invalidateQueries({ queryKey: [...keys.outreach, 'sequence'] });
    },
  });
  if (q.isLoading || !steps) return <Loading rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const update = (i: number, patch: Partial<SequenceStep>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const onSave = () => {
    const normalised = steps.map((s, i) => ({ ...s, step: i + 1 }));
    const r = SequenceConfigSchema.safeParse(normalised);
    if (!r.success) return setErr(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    for (let i = 1; i < normalised.length; i++) if (normalised[i]!.delayDays <= normalised[i - 1]!.delayDays) return setErr(`Step ${i + 1} must be later than step ${i}`);
    setErr(null);
    save.mutate(r.data);
  };
  return (
    <Section
      title="Sequence"
      description={`${steps.length} of ${MAX_TOUCHES_PER_BUSINESS} steps. Delays are days after the opener; any reply stops the sequence.`}
      actions={
        <Button loading={save.isPending} onClick={onSave}>
          Save sequence
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="divide-y">
          {steps.map((s, i) => (
            <div key={i} className="grid items-end gap-3 py-3 first:pt-0 sm:grid-cols-[72px_120px_160px_1fr_auto]">
              <div className="pb-2 text-sm font-medium text-muted-fg tabular-nums">Step {i + 1}</div>
              <Field label="Delay (days)" htmlFor={`st-delay-${i}`}>
                <Input id={`st-delay-${i}`} type="number" min={0} value={s.delayDays} disabled={i === 0} onChange={(e) => update(i, { delayDays: Number(e.target.value) })} />
              </Field>
              <Field label="Kind" htmlFor={`st-kind-${i}`}>
                <Select id={`st-kind-${i}`} value={s.kind} onChange={(e) => update(i, { kind: e.target.value as SequenceStep['kind'] })}>
                  {KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor={`st-notes-${i}`}>
                <Input id={`st-notes-${i}`} value={s.notes ?? ''} onChange={(e) => update(i, { notes: e.target.value })} />
              </Field>
              <Button variant="ghost" size="icon" className="text-muted-fg" aria-label={`Remove step ${i + 1}`} disabled={steps.length <= 1} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={steps.length >= MAX_TOUCHES_PER_BUSINESS} onClick={() => setSteps([...steps, { step: steps.length + 1, delayDays: (steps[steps.length - 1]?.delayDays ?? 0) + 4, kind: KINDS[Math.min(steps.length, 3)]! }])}>
            Add step
          </Button>
          {steps.length >= MAX_TOUCHES_PER_BUSINESS && <span className="text-sm text-muted-fg">Hard limit: {MAX_TOUCHES_PER_BUSINESS} touches per business.</span>}
        </div>
        {err && <Note tone="critical">{err}</Note>}
        <Disclosure summary="Default sequence and rules">
          Opener (day 0) → nudge (+4) → quote (+8) → close-out (+14). A bridge step is inserted automatically within 24h of a preview view. After the last step the business is permanently suppressed. Max {MAX_TOUCHES_PER_BUSINESS} touches, ever (spec §11.5, §20.4).
        </Disclosure>
      </div>
    </Section>
  );
}

/* ---------------- Domains & mailboxes ---------------- */
function Mailboxes() {
  const qc = useQueryClient();
  const domains = useQuery({ queryKey: [...keys.outreach, 'domains'], queryFn: api.outreach.domains, refetchInterval: 30_000 });
  const mailboxes = useQuery({ queryKey: [...keys.outreach, 'mailboxes'], queryFn: api.outreach.mailboxes, refetchInterval: 30_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.outreach });
  const [domain, setDomain] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [mbDomain, setMbDomain] = React.useState('');
  const [pausing, setPausing] = React.useState<MailboxWithReputation | null>(null);
  const addDomain = useMutation({ mutationFn: () => api.outreach.addDomain(domain.trim()), onSuccess: () => { toast.success('Domain added', 'Configure SPF, DKIM (2048), DMARC p=none, MTA-STS before sending.'); setDomain(''); refresh(); } });
  const addMailbox = useMutation({ mutationFn: () => api.outreach.addMailbox({ address: address.trim(), sendingDomain: mbDomain }), onSuccess: () => { toast.success('Mailbox added at warmup week 1 (5/day)'); setAddress(''); refresh(); } });
  const pause = useMutation({ mutationFn: (id: string) => api.outreach.pauseMailbox(id, 'operator'), onSuccess: () => { toast.success('Mailbox paused'); setPausing(null); refresh(); } });
  const resume = useMutation({ mutationFn: (id: string) => api.outreach.resumeMailbox(id), onSuccess: () => { toast.success('Mailbox resumed'); refresh(); } });
  const setCap = useMutation({ mutationFn: ({ id, cap }: { id: string; cap: number }) => api.outreach.setMailboxCap(id, Math.min(cap, MAILBOX_DAILY_CEILING)), onSuccess: () => { toast.success('Daily cap updated'); refresh(); } });
  const repByMailbox = new Map((mailboxes.data ?? []).map((m) => [m.id, m]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-base text-muted-fg">
          Hard ceiling: <span className="font-medium text-fg tabular-nums">{MAILBOX_DAILY_CEILING}</span> sends per mailbox per day. Not configurable anywhere in the UI.
        </p>
        <Disclosure summary="Why this limit">
          Raising it is what destroys cold-email systems: providers score volume ramps, and one burned domain takes 2–3 mailboxes and weeks of warmup with it. Capacity comes from more domains (2–4) × 2–3 mailboxes each, never from a higher cap. Warmup schedule: {WARMUP_SCHEDULE.map((c, i) => `wk${i + 1}=${c}`).join(' · ')} (real-lead share {WARMUP_REAL_SHARE.map((s) => `${Math.round(s * 100)}%`).join('/')}).
        </Disclosure>
      </div>
      <QueryState query={domains} empty={<EmptyState title="No sending domains" description="Add 2–4 lookalike domains to start." />} loading={<Loading rows={4} />}>
        {(list) => (
          <div className="space-y-6">
            {list.map((d) => (
              <Section
                key={d.id}
                title={d.domain}
                description={
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusLabel status={d.status} />
                    <span>DMARC p={d.dmarcPolicy}</span>
                    <span>
                      {d.mailboxes.length}/3 mailboxes · added {fmtDate(d.createdAt)}
                    </span>
                    {d.status === 'burned' && <span className="text-bad-fg">Burned: all mailboxes stopped permanently</span>}
                  </span>
                }
              >
                {d.mailboxes.length === 0 ? (
                  <p className="text-sm text-muted-fg">No mailboxes on this domain.</p>
                ) : (
                  <Table bare>
                    <THead>
                      <tr>
                        <TH>Mailbox</TH>
                        <TH>Warmup</TH>
                        <TH className="min-w-36">Sent today</TH>
                        <TH>Daily cap</TH>
                        <TH numeric>Bounce 7d</TH>
                        <TH numeric>Complaint 7d</TH>
                        <TH numeric>Reply rate</TH>
                        <TH />
                      </tr>
                    </THead>
                    <TBody>
                      {d.mailboxes.map((m) => {
                        const rep = repByMailbox.get(m.id)?.reputation;
                        const stageCap = WARMUP_SCHEDULE[Math.min(m.warmupStage, WARMUP_SCHEDULE.length - 1)];
                        return (
                          <TR key={m.id}>
                            <TD>
                              <div className="font-medium">{m.address}</div>
                              <CellSub className="flex items-center gap-2">
                                <StatusLabel status={m.status} className="gap-1.5" />
                                {m.pauseReason && <span className="text-bad-fg">· {m.pauseReason}</span>}
                              </CellSub>
                            </TD>
                            <TD>
                              <div className="whitespace-nowrap tabular-nums">
                                Week {m.warmupStage + 1} · {stageCap}/day
                              </div>
                              <CellSub>since {fmtDay(m.warmupStartedAt)}</CellSub>
                            </TD>
                            <TD>
                              <CapBar value={m.sentToday} cap={m.dailyCap} ceiling={MAILBOX_DAILY_CEILING} label="" showCeiling={false} />
                            </TD>
                            <TD>
                              <DailyCapInput id={`cap-${m.id}`} value={m.dailyCap} warmupStage={m.warmupStage} saving={setCap.isPending && setCap.variables?.id === m.id} onSave={(cap) => setCap.mutate({ id: m.id, cap })} />
                            </TD>
                            <TD numeric className={cn('whitespace-nowrap', rep && (rep.bounceRate7d > 0.03 || rep.bounceRate30d > 0.03) && 'font-medium text-bad-fg')}>
                              {rep ? (
                                <>
                                  {fmtPct(rep.bounceRate7d)}
                                  <CellSub>30d {fmtPct(rep.bounceRate30d)}</CellSub>
                                </>
                              ) : (
                                '—'
                              )}
                            </TD>
                            <TD numeric className={cn('whitespace-nowrap', rep && (rep.complaintRate7d > 0.001 || rep.complaintRate30d > 0.001) && 'font-medium text-bad-fg')}>
                              {rep ? (
                                <>
                                  {fmtPct(rep.complaintRate7d, 2)}
                                  <CellSub>30d {fmtPct(rep.complaintRate30d, 2)}</CellSub>
                                </>
                              ) : (
                                '—'
                              )}
                            </TD>
                            <TD numeric className={cn('whitespace-nowrap', rep && rep.sent30d >= 200 && rep.replyRate < 0.01 && 'font-medium text-warn-fg')}>
                              {rep ? (
                                <>
                                  {fmtPct(rep.replyRate)}
                                  <CellSub>{rep.sent30d} sent</CellSub>
                                </>
                              ) : (
                                '—'
                              )}
                            </TD>
                            <TD className="text-right">
                              {m.status === 'paused' ? (
                                <Button size="iconSm" variant="outline" aria-label={`Resume ${m.address}`} title="Resume mailbox" loading={resume.isPending && resume.variables === m.id} onClick={() => resume.mutate(m.id)}>
                                  {!(resume.isPending && resume.variables === m.id) && <Play className="size-4" aria-hidden />}
                                </Button>
                              ) : m.status !== 'burned' ? (
                                <Button size="iconSm" variant="outline" aria-label={`Pause ${m.address}`} title="Pause mailbox" onClick={() => setPausing(repByMailbox.get(m.id) ?? ({ ...m, reputation: undefined as never } as MailboxWithReputation))}>
                                  <Pause className="size-4" aria-hidden />
                                </Button>
                              ) : null}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </Section>
            ))}
          </div>
        )}
      </QueryState>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Add sending domain" description="Never the agency's primary domain or the preview host.">
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (domain.trim()) addDomain.mutate(); }}>
            <Field label="Domain" htmlFor="dom" className="flex-1">
              <Input id="dom" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="get-agency.com" />
            </Field>
            <Button type="submit" variant="outline" loading={addDomain.isPending}>Add domain</Button>
          </form>
        </Section>
        <Section title="Add mailbox" description="2–3 per domain, never more. Starts at warmup week 1.">
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (address.trim() && mbDomain) addMailbox.mutate(); }}>
            <Field label="Address" htmlFor="mb-addr" className="flex-1">
              <Input id="mb-addr" type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="anna@get-agency.com" />
            </Field>
            <Field label="Domain" htmlFor="mb-dom" className="w-48">
              <Select id="mb-dom" value={mbDomain} onChange={(e) => setMbDomain(e.target.value)}>
                <option value="">Pick a domain</option>
                {domains.data?.map((d) => (
                  <option key={d.id} value={d.domain} disabled={d.mailboxes.length >= 3 || d.status === 'burned'}>
                    {d.domain} ({d.mailboxes.length}/3)
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="outline" loading={addMailbox.isPending} disabled={!mbDomain}>Add mailbox</Button>
          </form>
        </Section>
      </div>
      <ConfirmDialog open={pausing !== null} onClose={() => setPausing(null)} onConfirm={() => pausing && pause.mutateAsync(pausing.id)} title={`Pause ${pausing?.address ?? ''}`} confirmLabel="Pause mailbox" blastRadius={<>Messages scheduled on this mailbox stay queued and are redistributed or delayed; nothing is lost. Warmup progress is kept.</>} />
    </div>
  );
}

/* ---------------- Reputation ---------------- */
function rateSeries(s: ReputationSeries) {
  return s.series.map((d) => ({
    day: d.day,
    bounce: d.sent > 0 ? d.bounced / d.sent : 0,
    complaint: d.sent > 0 ? d.complained / d.sent : 0,
    reply: d.sent > 0 ? d.replied / d.sent : 0,
    sent: d.sent,
  }));
}

function Reputation() {
  const [days, setDays] = React.useState<7 | 30>(30);
  const q = useQuery({ queryKey: [...keys.outreach, 'reputation', days], queryFn: () => api.outreach.reputation(days), refetchInterval: 60_000 });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl aria-label="Window" value={String(days)} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} onChange={(v) => setDays(Number(v) as 7 | 30)} />
        <Legend className="ml-auto" items={[{ label: 'Bounce rate', color: C.s1 }, { label: 'Complaint rate', color: C.s2 }, { label: 'Reply rate', color: C.s3 }, { label: 'Guardrail', color: C.critical, dashed: true }]} />
      </div>
      <Disclosure summary="Guardrails (spec §11.3)">
        Hard bounce &gt; 3% → pause + alert · complaint &gt; 0.1% → pause immediately · complaint &gt; 0.3% on a domain → domain burned · reply &lt; 1% after 200 sends → pause and force copy review.
      </Disclosure>
      <QueryState query={q} empty={<EmptyState title="No sends yet" description="Reputation series appear once mailboxes have sent." />}>
        {(list) => (
          <div className="grid gap-6 xl:grid-cols-2">
            {list.map((s) => {
              const data = rateSeries(s);
              return (
                <Section key={s.mailboxId} title={s.address} description={`${fmtNum(s.series.reduce((a, d) => a + d.sent, 0))} sent in ${days} days`}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ChartBox title="Bounce & complaint rate" right={<span className="text-xs text-muted-fg">guardrails 3% · 0.1%</span>} height={180}>
                      <ResponsiveContainer>
                        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={C.grid} />
                          <XAxis dataKey="day" tickFormatter={fmtDay} {...axisProps} minTickGap={24} />
                          <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} {...axisProps} axisLine={false} width={44} domain={[0, (max: number) => Math.max(0.035, max * 1.2)]} />
                          <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} formatter={(v, n) => [fmtPct(Number(v), 2), String(n)]} />
                          <ReferenceLine y={0.03} stroke={C.critical} strokeDasharray="4 3" />
                          <ReferenceLine y={0.001} stroke={C.critical} strokeDasharray="2 3" />
                          <Line type="monotone" dataKey="bounce" name="bounce" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="complaint" name="complaint" stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartBox>
                    <ChartBox title="Reply rate" right={<span className="text-xs text-muted-fg">1% floor after 200 sends</span>} height={180}>
                      <ResponsiveContainer>
                        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={C.grid} />
                          <XAxis dataKey="day" tickFormatter={fmtDay} {...axisProps} minTickGap={24} />
                          <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} {...axisProps} axisLine={false} width={44} />
                          <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} formatter={(v, n) => [n === 'sent' ? fmtNum(Number(v)) : fmtPct(Number(v)), String(n)]} />
                          <ReferenceLine y={0.01} stroke={C.critical} strokeDasharray="4 3" />
                          <Line type="monotone" dataKey="reply" name="reply" stroke={C.s3} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartBox>
                  </div>
                </Section>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}

/* ---------------- Schedule & capacity ---------------- */
function ScheduleCapacity() {
  const cap = useQuery({ queryKey: [...keys.outreach, 'capacity'], queryFn: api.outreach.capacity, refetchInterval: 60_000 });
  const sched = useQuery({ queryKey: [...keys.outreach, 'schedule'], queryFn: () => api.outreach.schedule(7), refetchInterval: 60_000 });
  const grid = React.useMemo(() => {
    const rows = sched.data ?? [];
    const days = Array.from(new Set(rows.map((r) => r.day))).sort();
    const boxes = Array.from(new Map(rows.map((r) => [r.mailboxId, r.address])).entries());
    return { days, boxes, cell: (mb: string, day: string) => rows.find((r) => r.mailboxId === mb && r.day === day) };
  }, [sched.data]);
  return (
    <div className="space-y-6">
      <QueryState query={cap}>
        {(c) => (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile label="Ceiling per mailbox" value={c.ceilingPerMailbox} hint="Fixed (spec §11.2)" />
            <StatTile label="Mailboxes" value={c.mailboxes} />
            <StatTile label="Daily ceiling" value={fmtNum(c.dailyCeiling)} hint={`${c.mailboxes} × ${c.ceilingPerMailbox} at full ramp`} />
            <StatTile label="Global cap" value={fmtNum(c.globalCap)} hint="MAX_SENDS_PER_DAY_GLOBAL" />
            <StatTile label="Used today" value={fmtNum(c.usedToday)} hint={`${c.globalCap > 0 ? Math.round((c.usedToday / Math.min(c.globalCap, c.dailyCeiling || c.globalCap)) * 100) : 0}% of today's effective cap`} tone={c.usedToday >= Math.min(c.globalCap, c.dailyCeiling) && c.usedToday > 0 ? 'warning' : 'default'} />
          </div>
        )}
      </QueryState>
      <Section title="Send schedule, next 7 days" description="Scheduled messages per mailbox per day against that day's cap. Cells at or over cap are highlighted.">
        <QueryState query={sched} empty={<EmptyState title="Nothing scheduled" description="Enqueue outreach from Leads to fill the schedule." />}>
          {() => (
            <Table bare>
              <THead>
                <tr>
                  <TH>Mailbox</TH>
                  {grid.days.map((d) => (
                    <TH key={d} numeric>
                      {fmtDay(d)}
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {grid.boxes.map(([id, address]) => (
                  <TR key={id}>
                    <TD className="font-medium">{address}</TD>
                    {grid.days.map((d) => {
                      const r = grid.cell(id, d);
                      const full = r && r.cap > 0 && r.scheduled >= r.cap;
                      return (
                        <TD key={d} numeric className={cn(full && 'bg-warn-bg font-medium text-warn-fg')}>
                          {r ? `${r.scheduled} / ${r.cap}` : '—'}
                        </TD>
                      );
                    })}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </Section>
    </div>
  );
}

/* ---------------- Approval queue ---------------- */
function ApprovalQueue() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...keys.outreach, 'approval-queue'], queryFn: api.outreach.approvalQueue, refetchInterval: 30_000 });
  const [preview, setPreview] = React.useState<ApprovalItem | null>(null);
  const [approving, setApproving] = React.useState<ApprovalItem | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [...keys.outreach, 'approval-queue'] });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
  };
  const approve = useMutation({ mutationFn: (id: string) => api.outreach.approveMessage(id), onSuccess: () => { toast.success('Approved for sending'); setApproving(null); refresh(); } });
  const cancel = useMutation({ mutationFn: (id: string) => api.outreach.cancelMessage(id), onSuccess: () => { toast.success('Message cancelled'); refresh(); } });
  const pv = useQuery({ queryKey: [...keys.outreach, 'preview', preview?.id], queryFn: () => api.outreach.preview(preview!.id), enabled: !!preview });
  return (
    <div className="space-y-4">
      <p className="text-base text-muted-fg">The first 20 sends and any message flagged by the copy guard wait here. Approving releases one message; it is still re-gated and cap-checked at dispatch.</p>
      <QueryState query={q} empty={<EmptyState title="Nothing awaiting approval" />} loading={<Loading rows={5} />}>
        {(items) => (
          <Table>
            <THead>
              <tr>
                <TH>Lead</TH>
                <TH>To</TH>
                <TH numeric>Step</TH>
                <TH>Subject</TH>
                <TH>Gate</TH>
                <TH>Scheduled</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {items.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <Link className="font-medium hover:underline" to={`/leads/${m.leadId}`}>
                      {m.lead.businessName}
                    </Link>
                    <CellSub>
                      {m.lead.city} {m.lead.countryCode} · <StageLabel stage={m.lead.stage} className="gap-1.5" />
                    </CellSub>
                  </TD>
                  <TD>
                    <div>{m.contact.email}</div>
                    <CellSub>
                      {m.contact.verification} · {m.contact.source}
                    </CellSub>
                  </TD>
                  <TD numeric>{m.sequenceStep}</TD>
                  <TD className="max-w-72 truncate" title={m.subject}>
                    {m.subject}
                  </TD>
                  <TD>
                    <GateLabel gate={m.lead.legalGate} />
                  </TD>
                  <TD className="text-sm text-muted-fg">{m.scheduledFor ? relTime(m.scheduledFor) : '—'}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setPreview(m)}>
                        Preview
                      </Button>
                      <Button size="sm" onClick={() => setApproving(m)} disabled={m.lead.legalGate !== 'clear' || m.contact.verification !== 'valid'}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-fg" loading={cancel.isPending && cancel.variables === m.id} onClick={() => cancel.mutate(m.id)}>
                        Cancel
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </QueryState>
      <Dialog open={preview !== null} onClose={() => setPreview(null)} title={preview ? preview.subject : ''} description={preview ? `To ${preview.contact.email} · step ${preview.sequenceStep}` : undefined} size="lg" footer={preview && <Button onClick={() => { setApproving(preview); setPreview(null); }} disabled={preview.lead.legalGate !== 'clear'}>Approve…</Button>}>
        {pv.isLoading ? (
          <Loading />
        ) : pv.isError ? (
          <ErrorState error={pv.error} onRetry={() => pv.refetch()} />
        ) : pv.data ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">
              {Object.entries(pv.data.headers ?? {}).map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-fg">{k}:</span> {v}
                </div>
              ))}
            </div>
            <pre className="rounded-md border p-4 font-sans text-base leading-relaxed whitespace-pre-wrap">{pv.data.bodyText}</pre>
            {pv.data.bodyHtml && (
              <details>
                <summary className="cursor-pointer text-sm text-primary">HTML rendering</summary>
                <iframe title="HTML preview" srcDoc={pv.data.bodyHtml} sandbox="" className="mt-2 h-96 w-full rounded-md border bg-white" />
              </details>
            )}
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={approving !== null}
        onClose={() => setApproving(null)}
        onConfirm={() => approving && approve.mutateAsync(approving.id)}
        title="Approve this message for sending"
        confirmLabel="Approve send"
        acknowledge="I have read the message, the contact is verified and the legal gate is clear."
        blastRadius={approving && <>One cold email (step {approving.sequenceStep}) to <strong>{approving.contact.email}</strong> at {approving.lead.businessName}, from the assigned mailbox, within its daily cap of {MAILBOX_DAILY_CEILING} max.</>}
      />
    </div>
  );
}
