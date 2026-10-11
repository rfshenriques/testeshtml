import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { QUEUES, type QueueSpec } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtNum, fmtUsd } from '@/lib/utils';
import { PageHeader, QueryState, Section, Button, Badge, Progress, Table, THead, TBody, TR, TH, TD, EmptyState, Checkbox, ConfirmDialog, Note } from '@/components/ui';
import { KillSwitchControl } from '@/components/layout/KillSwitch';
import { C, axisProps, tooltipStyle, ChartBox } from '@/components/charts/common';
import { AlertList, EconomicsTiles } from './Dashboard';

const NAME_TO_KEY: Record<string, string> = Object.fromEntries(Object.entries(QUEUES).map(([k, v]) => [v.name, k]));

export function OpsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...keys.ops, 'overview'], queryFn: api.ops.overview, refetchInterval: 15_000 });
  const campaigns = useQuery({ queryKey: keys.campaigns, queryFn: api.campaigns.list, staleTime: 60_000 });
  const [showAllAlerts, setShowAllAlerts] = React.useState(false);
  const allAlerts = useQuery({ queryKey: [...keys.alerts, 'all'], queryFn: () => api.ops.alerts(true), enabled: showAllAlerts });
  const [pausingQueue, setPausingQueue] = React.useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.ops });
    void qc.invalidateQueries({ queryKey: keys.alerts });
    void qc.invalidateQueries({ queryKey: keys.health });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
  };
  const ack = useMutation({ mutationFn: api.ops.ackAlert, onSuccess: refresh });
  const queueMut = useMutation({
    mutationFn: ({ key, pause }: { key: string; pause: boolean }) => (pause ? api.ops.pauseQueue(key) : api.ops.resumeQueue(key)),
    onSuccess: (r, v) => { toast.success(`Queue ${v.key} ${r.paused ? 'paused' : 'resumed'}`); setPausingQueue(null); refresh(); },
  });
  const campaignName = (id: string) => campaigns.data?.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title="Ops" description="Cost ledger, queue depths, kill switch, API quotas and alerts. Refreshes every 15s." />
      <QueryState query={q}>
        {(o) => {
          const totalCost = o.costs.byCategory.reduce((s, c) => s + c.usd, 0);
          const byCampaign = [...o.costs.byCampaign].sort((a, b) => b.usd - a.usd).map((c) => ({ ...c, name: c.name ?? campaignName(c.campaignId) }));
          const byCategory = [...o.costs.byCategory].sort((a, b) => b.usd - a.usd);
          return (
            <div className="space-y-4">
              <Section title="Kill switch" description="Stops every queue consumer and every billable external call. Public unsubscribe/takedown endpoints keep working. Always visible in the top bar too.">
                <div className="flex flex-wrap items-center gap-3">
                  <KillSwitchControl engaged={o.killSwitch} />
                  {o.killSwitch && <Note tone="critical">Engaged. Nothing is being sent or spent. Queued jobs are preserved.</Note>}
                </div>
              </Section>

              <EconomicsTiles e={o.economics} />

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Cost by category" description={`${fmtUsd(totalCost)} total`}>
                  {byCategory.length === 0 ? (
                    <EmptyState title="No cost events" />
                  ) : (
                    <>
                      <ChartBox height={Math.max(120, byCategory.length * 28 + 20)}>
                        <ResponsiveContainer>
                          <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }} barCategoryGap={2}>
                            <CartesianGrid horizontal={false} stroke={C.grid} />
                            <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `$${v}`} />
                            <YAxis type="category" dataKey="category" width={120} {...axisProps} />
                            <Tooltip {...tooltipStyle} formatter={(v) => [fmtUsd(Number(v)), 'USD']} />
                            <Bar dataKey="usd" fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartBox>
                      <Table>
                        <THead><tr><TH>Category</TH><TH className="text-right">Units</TH><TH className="text-right">USD</TH><TH className="text-right">Share</TH></tr></THead>
                        <TBody>
                          {byCategory.map((c) => (
                            <TR key={c.category}>
                              <TD>{c.category}</TD>
                              <TD className="text-right tabular-nums">{fmtNum(c.units)}</TD>
                              <TD className="text-right tabular-nums">{fmtUsd(c.usd)}</TD>
                              <TD className="text-right tabular-nums">{totalCost > 0 ? `${((c.usd / totalCost) * 100).toFixed(1)}%` : '—'}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </>
                  )}
                </Section>
                <Section title="Cost by campaign">
                  {byCampaign.length === 0 ? (
                    <EmptyState title="No campaign spend" />
                  ) : (
                    <>
                      <ChartBox height={Math.max(120, byCampaign.length * 28 + 20)}>
                        <ResponsiveContainer>
                          <BarChart data={byCampaign} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }} barCategoryGap={2}>
                            <CartesianGrid horizontal={false} stroke={C.grid} />
                            <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `$${v}`} />
                            <YAxis type="category" dataKey="name" width={140} {...axisProps} />
                            <Tooltip {...tooltipStyle} formatter={(v) => [fmtUsd(Number(v)), 'USD']} />
                            <Bar dataKey="usd" fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartBox>
                      <Table>
                        <THead><tr><TH>Campaign</TH><TH className="text-right">USD</TH></tr></THead>
                        <TBody>
                          {byCampaign.map((c) => (
                            <TR key={c.campaignId}>
                              <TD><Link className="hover:underline" to={`/campaigns/${c.campaignId}`}>{c.name}</Link></TD>
                              <TD className="text-right tabular-nums">{fmtUsd(c.usd)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </>
                  )}
                </Section>
              </div>

              <Section title="Queues" description="BullMQ depths. Pausing a queue stops its consumers; jobs stay queued.">
                <Table>
                  <THead>
                    <tr><TH>Queue</TH><TH className="text-right">Waiting</TH><TH className="text-right">Active</TH><TH className="text-right">Delayed</TH><TH className="text-right">Failed</TH><TH className="text-right">Completed</TH><TH>State</TH><TH /></tr>
                  </THead>
                  <TBody>
                    {o.queues.map((qd) => {
                      const key = NAME_TO_KEY[qd.name] ?? qd.name;
                      return (
                        <TR key={qd.name}>
                          <TD>
                            <div className="font-mono text-xs">{qd.name}</div>
                            {(QUEUES as Record<string, QueueSpec>)[key]?.notes && <div className="text-xs text-muted-fg">{(QUEUES as Record<string, QueueSpec>)[key]!.notes}</div>}
                          </TD>
                          <TD className={cn('text-right tabular-nums', qd.waiting > 1000 && 'text-warning font-medium')}>{fmtNum(qd.waiting)}</TD>
                          <TD className="text-right tabular-nums">{fmtNum(qd.active)}</TD>
                          <TD className="text-right tabular-nums">{fmtNum(qd.delayed)}</TD>
                          <TD className={cn('text-right tabular-nums', qd.failed > 0 && 'text-critical font-medium')}>{fmtNum(qd.failed)}</TD>
                          <TD className="text-right tabular-nums">{fmtNum(qd.completed)}</TD>
                          <TD>{qd.paused ? <Badge variant="warning">paused</Badge> : <Badge variant="success">running</Badge>}</TD>
                          <TD>
                            {qd.paused ? (
                              <Button size="sm" variant="outline" loading={queueMut.isPending && queueMut.variables?.key === key} onClick={() => queueMut.mutate({ key, pause: false })}>Resume</Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setPausingQueue(key)}>Pause</Button>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
                <ConfirmDialog open={pausingQueue !== null} onClose={() => setPausingQueue(null)} onConfirm={() => pausingQueue && queueMut.mutateAsync({ key: pausingQueue, pause: true })} title={`Pause queue ${pausingQueue ?? ''}`} confirmLabel="Pause queue" blastRadius={<>Workers stop taking jobs from <code>{pausingQueue}</code>. {fmtNum(o.queues.find((x) => NAME_TO_KEY[x.name] === pausingQueue)?.waiting ?? 0)} waiting jobs stay queued until resumed.</>} />
              </Section>

              <Section title="API quota usage" description="Daily hard caps enforced in each client wrapper (today, UTC).">
                {o.quotas.length === 0 ? (
                  <EmptyState title="No quota records today" />
                ) : (
                  <ul className="space-y-2">
                    {o.quotas.map((qu) => {
                      const pct = qu.cap > 0 ? qu.used / qu.cap : 0;
                      return (
                        <li key={`${qu.api}-${qu.day}`} className="text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{qu.api}</span>
                            <span className="tabular-nums text-xs text-muted-fg">{fmtNum(qu.used)} / {fmtNum(qu.cap)} ({(pct * 100).toFixed(0)}%)</span>
                          </div>
                          <Progress className="mt-1" value={qu.used} max={qu.cap} tone={pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warning' : 'primary'} label={`${qu.api} quota`} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <Section title={<span id="alerts">Alerts</span>} actions={<Checkbox id="all-alerts" label="Include acknowledged" checked={showAllAlerts} onChange={(e) => setShowAllAlerts(e.target.checked)} />}>
                <AlertList alerts={showAllAlerts ? allAlerts.data ?? o.alerts : o.alerts.filter((a) => !a.acknowledgedAt)} onAck={(id) => ack.mutate(id)} acking={ack.isPending ? (ack.variables as string) : null} />
              </Section>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
