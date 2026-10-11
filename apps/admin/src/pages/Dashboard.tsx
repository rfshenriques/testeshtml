import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, LabelList } from 'recharts';
import { MAILBOX_DAILY_CEILING } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { fmtUsd, fmtNum, toNumber, relTime } from '@/lib/utils';
import { PageHeader, Section, StatTile, QueryState, Progress, StatusBadge, Badge, Button, EmptyState, Note } from '@/components/ui';
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([label, v, hint]) => (
        <StatTile key={label} label={label} value={v == null ? <span className="text-muted-fg">n/a</span> : fmtUsd(v)} hint={hint} />
      ))}
    </div>
  );
}

export function AlertList({ alerts, onAck, acking }: { alerts: Alert[]; onAck?: (id: string) => void; acking?: string | null }) {
  if (alerts.length === 0) return <EmptyState title="No alerts" description="Budget, reputation, queue and error alerts land here." />;
  return (
    <ul className="divide-y">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2 text-sm">
          <Badge variant={a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'primary'}>{a.severity}</Badge>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              <span className="text-muted-fg">{a.kind}</span> · {a.message}
            </div>
            <div className="text-xs text-muted-fg">
              {relTime(a.createdAt)}
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
      <PageHeader title="Dashboard" description="Live view, refreshes every 30s." />
      <QueryState query={q}>
        {(d) => {
          const funnel = LEAD_STAGES.map((stage) => ({ stage, count: d.funnel.find((f) => f.stage === stage)?.count ?? 0 })).filter((f) => f.count > 0 || ['discovered', 'qualified', 'enriched', 'profiled', 'generated', 'quoted', 'contacted', 'replied', 'won'].includes(f.stage));
          const totalBudget = d.campaigns.list.reduce((s, c) => s + toNumber(c.budgetUsdCap), 0);
          const totalSpend = d.campaigns.list.reduce((s, c) => s + toNumber(c.spendUsd), 0);
          const sendPct = d.sends.cap > 0 ? d.sends.today / d.sends.cap : 0;
          const unhealthy = d.sends.perMailbox.filter((m) => m.status === 'paused' || m.status === 'burned');
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <StatTile label="Campaigns running" value={`${d.campaigns.running}`} hint={`${d.campaigns.total} total`} />
                <StatTile label="Sends today" value={`${d.sends.today} / ${d.sends.cap}`} hint={`${d.sends.perMailbox.length} mailboxes · ceiling ${MAILBOX_DAILY_CEILING}/mailbox`} tone={sendPct >= 1 ? 'warning' : 'default'} />
                <StatTile label="Reply queue" value={fmtNum(d.replyQueue)} hint={<Link className="text-primary hover:underline" to="/inbox">Open inbox</Link>} tone={d.replyQueue > 0 ? 'warning' : 'default'} />
                <StatTile label="Review queue" value={fmtNum(d.reviewQueue)} hint={<Link className="text-primary hover:underline" to="/review">Open review</Link>} tone={d.reviewQueue > 0 ? 'warning' : 'default'} />
                <StatTile label="Approval queue" value={fmtNum(d.approvalQueue)} hint={<Link className="text-primary hover:underline" to="/outreach?tab=approvals">Approve sends</Link>} tone={d.approvalQueue > 0 ? 'warning' : 'default'} />
                <StatTile label="Preview views today" value={fmtNum(d.viewsToday)} />
              </div>

              <EconomicsTiles e={d.economics} />

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Funnel by stage" description="Leads currently in each pipeline stage.">
                  {funnel.every((f) => f.count === 0) ? (
                    <EmptyState title="No leads yet" description="Start a campaign to populate the funnel." />
                  ) : (
                    <ChartBox height={260}>
                      <ResponsiveContainer>
                        <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }} barCategoryGap={2}>
                          <CartesianGrid horizontal={false} stroke={C.grid} />
                          <XAxis type="number" {...axisProps} allowDecimals={false} />
                          <YAxis type="category" dataKey="stage" width={96} {...axisProps} />
                          <Tooltip {...tooltipStyle} formatter={(v) => [fmtNum(Number(v)), 'leads']} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                            {funnel.map((f, i) => (
                              <Cell key={f.stage} fill={['won', 'replied'].includes(f.stage) ? C.s3 : ['lost', 'excluded', 'suppressed', 'manual_review'].includes(f.stage) ? C.text : C.seq[Math.min(4, Math.floor(i / 2))]} />
                            ))}
                            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: 'var(--fg)' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartBox>
                  )}
                </Section>

                <Section
                  title="Sends today vs cap, per mailbox"
                  description={
                    <>
                      Each bar is drawn against the hard ceiling of <strong>{MAILBOX_DAILY_CEILING}/mailbox/day</strong> (red stop). The lighter band is the mailbox&apos;s current warmup cap.
                    </>
                  }
                >
                  {d.sends.perMailbox.length === 0 ? (
                    <EmptyState title="No mailboxes" description="Add sending domains and mailboxes under Outreach." />
                  ) : (
                    <div className="space-y-2">
                      {d.sends.perMailbox.map((m) => (
                        <div key={m.id} className="flex items-center gap-2">
                          <CapBar className="flex-1" value={m.sentToday} cap={m.dailyCap} ceiling={MAILBOX_DAILY_CEILING} label={m.address} />
                          <StatusBadge status={m.status} />
                          <span className="w-10 text-right text-xs text-muted-fg">wk {m.warmupStage + 1}</span>
                        </div>
                      ))}
                      <div className="pt-1">
                        <Progress value={d.sends.today} max={d.sends.cap} tone={sendPct >= 1 ? 'warning' : 'primary'} label="Global sends today" />
                        <div className="mt-1 text-xs text-muted-fg">
                          {d.sends.today} of {d.sends.cap} global cap used today.
                        </div>
                      </div>
                      {unhealthy.length > 0 && (
                        <Note tone="warning">
                          {unhealthy.length} mailbox(es) paused or burned: {unhealthy.map((m) => m.address).join(', ')}. See <Link className="underline" to="/outreach?tab=mailboxes">Outreach</Link>.
                        </Note>
                      )}
                    </div>
                  )}
                </Section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Spend vs budget" description={`${fmtUsd(totalSpend)} of ${fmtUsd(totalBudget)} across all campaigns`}>
                  {d.campaigns.list.length === 0 ? (
                    <EmptyState title="No campaigns" action={<Link to="/campaigns" className="text-xs text-primary hover:underline">Create one</Link>} />
                  ) : (
                    <ul className="space-y-2">
                      {d.campaigns.list.map((c) => {
                        const spend = toNumber(c.spendUsd);
                        const cap = toNumber(c.budgetUsdCap);
                        const pct = cap > 0 ? spend / cap : 0;
                        return (
                          <li key={c.id} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <Link to={`/campaigns/${c.id}`} className="truncate font-medium hover:underline">
                                {c.name} <span className="text-xs text-muted-fg">{c.countryCode}</span>
                              </Link>
                              <div className="flex items-center gap-2 text-xs tabular-nums">
                                <span>{fmtNum(c.leads)} leads</span>
                                <StatusBadge status={c.status} />
                                <span>
                                  {fmtUsd(spend)} / {fmtUsd(cap, 0)}
                                </span>
                              </div>
                            </div>
                            <Progress className="mt-1" value={spend} max={cap} tone={pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warning' : 'primary'} label={`${c.name} spend`} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>
                <Section title="Alerts" description="Unacknowledged first." actions={<Link to="/ops#alerts" className="text-xs text-primary hover:underline">All alerts</Link>}>
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
