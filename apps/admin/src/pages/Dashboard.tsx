import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, LabelList } from 'recharts';
import { MAILBOX_DAILY_CEILING } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { cn, fmtUsd, fmtNum, toNumber, relTime } from '@/lib/utils';
import { PageHeader, Section, StatTile, QueryState, Progress, Button, EmptyState, Note, DotLabel, StatusLabel, buttonVariants, type Tone } from '@/components/ui';
import { C, axisProps, tooltipStyle, CapBar, ChartBox } from '@/components/charts/common';
import type { Alert, Economics } from '@/lib/types';
import { LEAD_STAGES } from '@/lib/types';

export function EconomicsTiles({ e }: { e: Economics | undefined }) {
  const tiles: [string, number | null | undefined, string][] = [
    ['Cost per lead', e?.costPerLead, `${fmtUsd(e?.totalUsd)} / ${fmtNum(e?.leads)} leads`],
    ['Cost per contacted', e?.costPerContacted, `${fmtNum(e?.contacted)} contacted`],
    ['Cost per reply', e?.costPerReply, `${fmtNum(e?.replied)} replies`],
    ['Cost per won', e?.costPerWon, `${fmtNum(e?.won)} won`],
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map(([label, v, hint]) => (
        <StatTile key={label} label={label} value={v == null ? <span className="text-muted-fg">n/a</span> : fmtUsd(v)} hint={hint} />
      ))}
    </div>
  );
}

const SEVERITY_TONE: Record<string, Tone> = { critical: 'blocked', warning: 'warning', info: 'info' };

export function AlertList({ alerts, onAck, acking }: { alerts: Alert[]; onAck?: (id: string) => void; acking?: string | null }) {
  if (alerts.length === 0) return <EmptyState title="No alerts" description="Budget, reputation, queue and error alerts land here." />;
  return (
    <ul className="divide-y">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
          <DotLabel tone={SEVERITY_TONE[a.severity] ?? 'neutral'} className="mt-1 w-20 shrink-0 text-sm text-muted-fg capitalize">
            {a.severity}
          </DotLabel>
          <div className="min-w-0 flex-1">
            <div className="leading-snug">{a.message}</div>
            <div className="mt-0.5 text-sm text-muted-fg">
              {a.kind.replace(/_/g, ' ')} · {relTime(a.createdAt)}
              {a.acknowledgedAt && ` · acknowledged ${relTime(a.acknowledgedAt)}`}
            </div>
          </div>
          {onAck && !a.acknowledgedAt && (
            <Button size="sm" variant="outline" loading={acking === a.id} onClick={() => onAck(a.id)}>
              Acknowledge
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

const TERMINAL = ['lost', 'excluded', 'suppressed', 'manual_review'];

export function DashboardPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.dashboard, queryFn: api.dashboard.get, refetchInterval: 30_000 });
  const ack = useMutation({
    mutationFn: api.ops.ackAlert,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.alerts });
    },
  });

  return (
    <>
      <PageHeader title="Dashboard" description="Live view of the pipeline, sending capacity and spend. Refreshes every 30 seconds." />
      <QueryState query={q}>
        {(d) => {
          const funnel = LEAD_STAGES.map((stage) => ({ stage: stage.replace(/_/g, ' '), raw: stage, count: d.funnel.find((f) => f.stage === stage)?.count ?? 0 })).filter((f) => f.count > 0 || ['discovered', 'qualified', 'enriched', 'profiled', 'generated', 'quoted', 'contacted', 'replied', 'won'].includes(f.raw));
          const totalBudget = d.campaigns.list.reduce((s, c) => s + toNumber(c.budgetUsdCap), 0);
          const totalSpend = d.campaigns.list.reduce((s, c) => s + toNumber(c.spendUsd), 0);
          const sendPct = d.sends.cap > 0 ? d.sends.today / d.sends.cap : 0;
          const unhealthy = d.sends.perMailbox.filter((m) => m.status === 'paused' || m.status === 'burned');
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatTile label="Campaigns running" value={`${d.campaigns.running}`} hint={`${d.campaigns.total} total`} />
                <StatTile label="Sends today" value={`${d.sends.today} / ${d.sends.cap}`} hint={`${d.sends.perMailbox.length} mailboxes · ceiling ${MAILBOX_DAILY_CEILING}/mailbox`} tone={sendPct >= 1 ? 'warning' : 'default'} />
                <StatTile label="Reply queue" value={fmtNum(d.replyQueue)} hint={<Link className="text-primary hover:underline" to="/inbox">Open inbox</Link>} />
                <StatTile label="Review queue" value={fmtNum(d.reviewQueue)} hint={<Link className="text-primary hover:underline" to="/review">Open review</Link>} />
                <StatTile label="Approval queue" value={fmtNum(d.approvalQueue)} hint={<Link className="text-primary hover:underline" to="/outreach?tab=approvals">Approve sends</Link>} />
                <StatTile label="Preview views today" value={fmtNum(d.viewsToday)} />
              </div>

              <EconomicsTiles e={d.economics} />

              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Funnel by stage" description="Leads currently in each pipeline stage.">
                  {funnel.every((f) => f.count === 0) ? (
                    <EmptyState title="No leads yet" description="Start a campaign to populate the funnel." />
                  ) : (
                    <ChartBox height={Math.max(200, funnel.length * 26 + 28)}>
                      <ResponsiveContainer>
                        <BarChart data={funnel} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 0 }} barCategoryGap={6}>
                          <CartesianGrid horizontal={false} stroke={C.grid} strokeDasharray="0" />
                          <XAxis type="number" {...axisProps} allowDecimals={false} axisLine={false} />
                          <YAxis type="category" dataKey="stage" width={104} {...axisProps} axisLine={false} interval={0} />
                          <Tooltip {...tooltipStyle} formatter={(v) => [fmtNum(Number(v)), 'leads']} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
                            {funnel.map((f) => (
                              <Cell key={f.raw} fill={TERMINAL.includes(f.raw) ? C.muted : C.s1} />
                            ))}
                            <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartBox>
                  )}
                </Section>

                <Section title="Sends today per mailbox" description={`Hard ceiling ${MAILBOX_DAILY_CEILING} per mailbox per day (red tick). The pale band is the mailbox's current warmup cap.`}>
                  {d.sends.perMailbox.length === 0 ? (
                    <EmptyState title="No mailboxes" description="Add sending domains and mailboxes under Outreach." />
                  ) : (
                    <div className="space-y-4">
                      <ul className="space-y-3">
                        {d.sends.perMailbox.map((m) => (
                          <li key={m.id} className="flex items-center gap-4">
                            <CapBar className="min-w-0 flex-1" value={m.sentToday} cap={m.dailyCap} ceiling={MAILBOX_DAILY_CEILING} label={m.address} showCeiling={false} />
                            <StatusLabel status={m.status} className="w-24 text-sm" muted />
                            <span className="w-12 text-right text-sm text-muted-fg tabular-nums">wk {m.warmupStage + 1}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t pt-4">
                        <div className="mb-2 flex items-baseline justify-between text-sm">
                          <span className="text-muted-fg">Global cap</span>
                          <span className="tabular-nums">
                            {d.sends.today} / {d.sends.cap}
                          </span>
                        </div>
                        <Progress value={d.sends.today} max={d.sends.cap} tone={sendPct >= 1 ? 'warning' : 'primary'} label="Global sends today" />
                      </div>
                      {unhealthy.length > 0 && (
                        <Note tone="warning">
                          {unhealthy.length} mailbox{unhealthy.length === 1 ? '' : 'es'} paused or burned: {unhealthy.map((m) => m.address).join(', ')}.{' '}
                          <Link className="text-primary hover:underline" to="/outreach?tab=mailboxes">
                            Open Outreach
                          </Link>
                        </Note>
                      )}
                    </div>
                  )}
                </Section>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Spend vs budget" description={`${fmtUsd(totalSpend)} of ${fmtUsd(totalBudget)} across all campaigns.`}>
                  {d.campaigns.list.length === 0 ? (
                    <EmptyState title="No campaigns" action={<Link to="/campaigns" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>Create one</Link>} />
                  ) : (
                    <ul className="space-y-4">
                      {d.campaigns.list.map((c) => {
                        const spend = toNumber(c.spendUsd);
                        const cap = toNumber(c.budgetUsdCap);
                        const pct = cap > 0 ? spend / cap : 0;
                        return (
                          <li key={c.id}>
                            <div className="flex items-center justify-between gap-3">
                              <Link to={`/campaigns/${c.id}`} className="min-w-0 truncate font-medium hover:underline">
                                {c.name} <span className="ml-1 text-sm font-normal text-muted-fg">{c.countryCode}</span>
                              </Link>
                              <div className="flex shrink-0 items-center gap-3 text-sm text-muted-fg tabular-nums">
                                <span>{fmtNum(c.leads)} leads</span>
                                <StatusLabel status={c.status} muted />
                                <span className="text-fg">
                                  {fmtUsd(spend)} / {fmtUsd(cap, 0)}
                                </span>
                              </div>
                            </div>
                            <Progress className="mt-2" value={spend} max={cap} tone={pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warning' : 'primary'} label={`${c.name} spend`} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>
                <Section title="Alerts" description="Unacknowledged first." actions={<Link to="/ops#alerts" className="text-sm text-primary hover:underline">All alerts</Link>}>
                  <AlertList alerts={[...d.alerts].sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt))} onAck={(id) => ack.mutate(id)} acking={ack.isPending ? (ack.variables as string) : null} />
                </Section>
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
