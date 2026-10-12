import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { QUEUES, type QueueSpec } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtNum, fmtUsd } from '@/lib/utils';
import { PageHeader, QueryState, Section, Button, Progress, Table, THead, TBody, TR, TH, TD, CellSub, EmptyState, Checkbox, ConfirmDialog, Note, StatusLabel } from '@/components/ui';
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
      <PageHeader title="Ops" description="Cost ledger, queue depths, API quotas and alerts. Refreshes every 15 seconds. The kill switch lives in the top bar." />
      <QueryState query={q}>
        {(o) => {
          const totalCost = o.costs.byCategory.reduce((s, c) => s + c.usd, 0);
          const byCampaign = [...o.costs.byCampaign].sort((a, b) => b.usd - a.usd).map((c) => ({ ...c, name: c.name ?? campaignName(c.campaignId) }));
          const byCategory = [...o.costs.byCategory].sort((a, b) => b.usd - a.usd);
          return (
            <div className="space-y-6">
              {o.killSwitch && <Note tone="critical">Kill switch engaged. Nothing is being sent or spent; queued jobs are preserved. Public unsubscribe and takedown endpoints keep working.</Note>}

              <EconomicsTiles e={o.economics} />

              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Cost by category" description={`${fmtUsd(totalCost)} total`}>
                  {byCategory.length === 0 ? (
                    <EmptyState title="No cost events" />
                  ) : (
                    <div className="space-y-4">
                      <ChartBox height={Math.max(120, byCategory.length * 30 + 24)}>
                        <ResponsiveContainer>
                          <BarChart data={byCategory} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 0 }} barCategoryGap={6}>
                            <CartesianGrid horizontal={false} stroke={C.grid} />
                            <XAxis type="number" {...axisProps} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
                            <YAxis type="category" dataKey="category" width={128} {...axisProps} axisLine={false} interval={0} />
                            <Tooltip {...tooltipStyle} formatter={(v) => [fmtUsd(Number(v)), 'USD']} />
                            <Bar dataKey="usd" fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartBox>
                      <Table bare>
                        <THead>
                          <tr>
                            <TH>Category</TH>
                            <TH numeric>Units</TH>
                            <TH numeric>USD</TH>
                            <TH numeric>Share</TH>
                          </tr>
                        </THead>
                        <TBody>
                          {byCategory.map((c) => (
                            <TR key={c.category}>
                              <TD>{c.category}</TD>
                              <TD numeric>{fmtNum(c.units)}</TD>
                              <TD numeric>{fmtUsd(c.usd)}</TD>
                              <TD numeric className="text-muted-fg">{totalCost > 0 ? `${((c.usd / totalCost) * 100).toFixed(1)}%` : '—'}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </Section>
                <Section title="Cost by campaign">
                  {byCampaign.length === 0 ? (
                    <EmptyState title="No campaign spend" />
                  ) : (
                    <div className="space-y-4">
                      <ChartBox height={Math.max(120, byCampaign.length * 30 + 24)}>
                        <ResponsiveContainer>
                          <BarChart data={byCampaign} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 0 }} barCategoryGap={6}>
                            <CartesianGrid horizontal={false} stroke={C.grid} />
                            <XAxis type="number" {...axisProps} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
                            <YAxis type="category" dataKey="name" width={168} {...axisProps} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
                            <Tooltip {...tooltipStyle} formatter={(v) => [fmtUsd(Number(v)), 'USD']} />
                            <Bar dataKey="usd" fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartBox>
                      <Table bare>
                        <THead>
                          <tr>
                            <TH>Campaign</TH>
                            <TH numeric>USD</TH>
                          </tr>
                        </THead>
                        <TBody>
                          {byCampaign.map((c) => (
                            <TR key={c.campaignId}>
                              <TD>
                                <Link className="hover:underline" to={`/campaigns/${c.campaignId}`}>
                                  {c.name}
                                </Link>
                              </TD>
                              <TD numeric>{fmtUsd(c.usd)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </Section>
              </div>

              <Section title="Queues" description="BullMQ depths. Pausing a queue stops its consumers; jobs stay queued.">
                <Table bare>
                  <THead>
                    <tr>
                      <TH>Queue</TH>
                      <TH numeric>Waiting</TH>
                      <TH numeric>Active</TH>
                      <TH numeric>Delayed</TH>
                      <TH numeric>Failed</TH>
                      <TH numeric>Completed</TH>
                      <TH>State</TH>
                      <TH />
                    </tr>
                  </THead>
                  <TBody>
                    {o.queues.map((qd) => {
                      const key = NAME_TO_KEY[qd.name] ?? qd.name;
                      const notes = (QUEUES as Record<string, QueueSpec>)[key]?.notes;
                      return (
                        <TR key={qd.name}>
                          <TD>
                            <div className="font-mono text-sm">{qd.name}</div>
                            {notes && <CellSub className="max-w-md whitespace-normal">{notes}</CellSub>}
                          </TD>
                          <TD numeric className={cn(qd.waiting > 1000 && 'font-medium text-warn-fg')}>{fmtNum(qd.waiting)}</TD>
                          <TD numeric>{fmtNum(qd.active)}</TD>
                          <TD numeric>{fmtNum(qd.delayed)}</TD>
                          <TD numeric className={cn(qd.failed > 0 && 'font-medium text-bad-fg')}>{fmtNum(qd.failed)}</TD>
                          <TD numeric className="text-muted-fg">{fmtNum(qd.completed)}</TD>
                          <TD>
                            <StatusLabel status={qd.paused ? 'paused' : 'running'} />
                          </TD>
                          <TD className="text-right">
                            {qd.paused ? (
                              <Button size="sm" variant="outline" loading={queueMut.isPending && queueMut.variables?.key === key} onClick={() => queueMut.mutate({ key, pause: false })}>
                                Resume
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setPausingQueue(key)}>
                                Pause
                              </Button>
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
                  <ul className="space-y-4">
                    {o.quotas.map((qu) => {
                      const pct = qu.cap > 0 ? qu.used / qu.cap : 0;
                      return (
                        <li key={`${qu.api}-${qu.day}`}>
                          <div className="flex items-baseline justify-between">
                            <span className="font-medium">{qu.api}</span>
                            <span className="text-sm text-muted-fg tabular-nums">
                              {fmtNum(qu.used)} / {fmtNum(qu.cap)} · {(pct * 100).toFixed(0)}%
                            </span>
                          </div>
                          <Progress className="mt-2" value={qu.used} max={qu.cap} tone={pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warning' : 'primary'} label={`${qu.api} quota`} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <Section title={<span id="alerts">Alerts</span>} actions={<Checkbox id="all-alerts" label={<span className="text-sm">Include acknowledged</span>} checked={showAllAlerts} onChange={(e) => setShowAllAlerts(e.target.checked)} />}>
                <AlertList alerts={showAllAlerts ? allAlerts.data ?? o.alerts : o.alerts.filter((a) => !a.acknowledgedAt)} onAck={(id) => ack.mutate(id)} acking={ack.isPending ? (ack.variables as string) : null} />
              </Section>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
