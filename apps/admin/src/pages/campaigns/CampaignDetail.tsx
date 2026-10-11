import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Play, Pause, Square, RefreshCw, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtUsd, fmtNum, toNumber, fmtDate } from '@/lib/utils';
import { Button, PageHeader, QueryState, Section, StatusBadge, StatTile, ConfirmDialog, KV, JsonView, Table, THead, TBody, TR, TH, TD, EmptyState, Note, Progress } from '@/components/ui';
import { TileMap } from './TileMap';
import { EconomicsTiles } from '@/pages/Dashboard';

type Action = 'start' | 'pause' | 'resume' | 'halt' | 'requalify';

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.campaign(id), queryFn: () => api.campaigns.get(id), enabled: !!id, refetchInterval: 15_000 });
  const tiles = useQuery({ queryKey: keys.tiles(id), queryFn: () => api.campaigns.tiles(id), enabled: !!id, refetchInterval: 15_000 });
  const [confirm, setConfirm] = React.useState<Action | null>(null);
  const mut = useMutation({
    mutationFn: (a: Action) => api.campaigns[a](id),
    onSuccess: (_r, a) => {
      toast.success(`Campaign ${a === 'requalify' ? 'requalification enqueued' : a + 'd'}`);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: keys.campaign(id) });
      void qc.invalidateQueries({ queryKey: keys.campaigns });
      void qc.invalidateQueries({ queryKey: keys.tiles(id) });
    },
  });

  return (
    <>
      <Link to="/campaigns" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-fg hover:text-fg">
        <ArrowLeft className="size-3" aria-hidden /> All campaigns
      </Link>
      <QueryState query={q}>
        {(d) => {
          const c = d.campaign;
          const spend = toNumber(c.spendUsd), cap = toNumber(c.budgetUsdCap);
          const leads = d.leadsByStage.reduce((s, x) => s + x.count, 0);
          const t = d.tiles;
          const blast: Record<Action, React.ReactNode> = {
            start: (
              <>
                Spends real money: estimated <strong>{fmtNum(d.estimate.searchRequests)}</strong> Places search requests ≈ <strong>{fmtUsd(d.estimate.usd)}</strong>, plus Details calls on qualifying leads, up to the budget cap of{' '}
                <strong>{fmtUsd(cap, 0)}</strong>
                {c.maxLeads ? ` or ${fmtNum(c.maxLeads)} leads` : ''}. Country {c.countryCode}, {c.includedTypes.length} place types.
              </>
            ),
            pause: <>Stops enqueuing new tiles. Tiles already in flight finish. {fmtNum(leads)} existing leads continue through enrichment/outreach unaffected.</>,
            resume: <>Resumes tile discovery and spending against the remaining budget ({fmtUsd(Math.max(0, cap - spend))} left).</>,
            halt: (
              <>
                <strong>Irreversible.</strong> Discovery stops permanently for this campaign; {fmtNum(t.pending + t.searching)} pending/searching tiles are abandoned. The {fmtNum(leads)} leads already discovered are kept.
              </>
            ),
            requalify: <>Re-runs the website probe and scoring for all {fmtNum(leads)} leads in this campaign. Scores and stages may change; leads already contacted are not re-sent.</>,
          };
          return (
            <div className="space-y-4">
              <PageHeader
                title={c.name}
                description={
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={c.status} /> {c.countryCode} · geometry {c.geometry.kind} · created {fmtDate(c.createdAt)}
                  </span>
                }
                actions={
                  <>
                    {c.status === 'draft' && (
                      <Button onClick={() => setConfirm('start')}>
                        <Play className="size-4" aria-hidden /> Start
                      </Button>
                    )}
                    {c.status === 'running' && (
                      <Button variant="outline" onClick={() => setConfirm('pause')}>
                        <Pause className="size-4" aria-hidden /> Pause
                      </Button>
                    )}
                    {c.status === 'paused' && (
                      <Button onClick={() => setConfirm('resume')}>
                        <Play className="size-4" aria-hidden /> Resume
                      </Button>
                    )}
                    {(c.status === 'running' || c.status === 'paused') && (
                      <Button variant="destructive" onClick={() => setConfirm('halt')}>
                        <Square className="size-4" aria-hidden /> Halt
                      </Button>
                    )}
                    {leads > 0 && (
                      <Button variant="outline" onClick={() => setConfirm('requalify')}>
                        <RefreshCw className="size-4" aria-hidden /> Requalify
                      </Button>
                    )}
                    <Link to={`/leads?campaignId=${c.id}`} className="text-sm text-primary hover:underline">
                      View leads
                    </Link>
                  </>
                }
              />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatTile label="Spend" value={fmtUsd(spend)} hint={<>of {fmtUsd(cap, 0)} cap<Progress className="mt-1" value={spend} max={cap} tone={cap > 0 && spend / cap >= 0.9 ? 'critical' : 'primary'} label="Spend vs cap" /></>} tone={cap > 0 && spend / cap >= 0.9 ? 'critical' : 'default'} />
                <StatTile label="Leads" value={fmtNum(leads)} hint={c.maxLeads ? `max ${fmtNum(c.maxLeads)}` : 'no max'} />
                <StatTile label="Tiles" value={`${t.done + t.saturated} / ${t.total}`} hint={`${t.pending} pending · ${t.searching} searching · ${t.failed} failed`} tone={t.failed > 0 ? 'warning' : 'default'} />
                <StatTile label="Estimate" value={fmtUsd(d.estimate.usd)} hint={`${fmtNum(d.estimate.searchRequests)} search requests`} />
                <StatTile label="Total cost" value={fmtUsd(d.costs.economics.totalUsd)} hint="all categories" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                <Section title="Tile progress" description="Quadtree tiles coloured by status. Saturated tiles were subdivided; deeper tiles are drawn on top.">
                  {tiles.isLoading ? <div className="text-sm text-muted-fg">Loading tiles…</div> : tiles.data && tiles.data.length > 0 ? <TileMap tiles={tiles.data} /> : <EmptyState title="No tiles yet" description={c.status === 'draft' ? 'Tiles are created when the campaign starts.' : 'Waiting for the root tile.'} />}
                </Section>
                <div className="space-y-4">
                  <Section title="Leads by stage">
                    {d.leadsByStage.length === 0 ? (
                      <div className="text-sm text-muted-fg">No leads yet.</div>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {d.leadsByStage.map((s) => (
                          <li key={s.stage} className="flex items-center gap-2">
                            <span className="w-28 text-muted-fg">{s.stage.replace(/_/g, ' ')}</span>
                            <Progress className="flex-1" value={s.count} max={leads} label={s.stage} />
                            <span className="w-10 text-right tabular-nums">{s.count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <Section title="Cost breakdown">
                    {d.costs.byCategory.length === 0 ? (
                      <div className="text-sm text-muted-fg">No cost events yet.</div>
                    ) : (
                      <Table>
                        <THead>
                          <tr>
                            <TH>Category</TH>
                            <TH className="text-right">Units</TH>
                            <TH className="text-right">USD</TH>
                          </tr>
                        </THead>
                        <TBody>
                          {d.costs.byCategory.map((r) => (
                            <TR key={r.category}>
                              <TD>{r.category}</TD>
                              <TD className="text-right tabular-nums">{fmtNum(r.units)}</TD>
                              <TD className="text-right tabular-nums">{fmtUsd(r.usd)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}
                  </Section>
                </div>
              </div>
              <EconomicsTiles e={d.costs.economics} />
              <Section title="Configuration">
                <KV
                  items={[
                    ['Included types', c.includedTypes.join(', ')],
                    ['Excluded types', c.excludedTypes?.length ? c.excludedTypes.join(', ') : '—'],
                    ['Language', c.languageCode ?? 'jurisdiction default'],
                    ['Include http_only', c.includeHttpOnly ? 'yes' : 'no'],
                    ['Geometry', <JsonView key="g" value={c.geometry} collapsed />],
                  ]}
                />
                {c.status !== 'draft' && <Note className="mt-3">Configuration can only be edited while a campaign is a draft.</Note>}
              </Section>
              <ConfirmDialog
                open={confirm !== null}
                onClose={() => setConfirm(null)}
                onConfirm={() => confirm && mut.mutateAsync(confirm)}
                title={confirm ? `${confirm[0]!.toUpperCase()}${confirm.slice(1)} campaign` : ''}
                confirmLabel={confirm ? confirm[0]!.toUpperCase() + confirm.slice(1) : 'Confirm'}
                destructive={confirm === 'halt'}
                typeToConfirm={confirm === 'halt' ? 'HALT' : undefined}
                loading={mut.isPending}
                blastRadius={confirm ? blast[confirm] : null}
              />
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
