import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { fmtUsd, fmtNum, toNumber } from '@/lib/utils';
import { Button, PageHeader, QueryState, Table, THead, TBody, TR, TH, TD, StatusLabel, Progress, EmptyState, Loading } from '@/components/ui';
import { CreateCampaignDialog } from './CreateCampaignDialog';

export function CampaignsPage() {
  const [open, setOpen] = React.useState(false);
  const nav = useNavigate();
  const q = useQuery({ queryKey: keys.campaigns, queryFn: api.campaigns.list, refetchInterval: 30_000 });
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Territory campaigns with explicit budget ceilings, funded one at a time."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> New campaign
          </Button>
        }
      />
      <QueryState query={q} loading={<Loading rows={5} className="rounded-lg border bg-card" />} empty={<EmptyState className="rounded-lg border bg-card" title="No campaigns yet" description="Create a draft with a territory, place types and a budget cap. Starting it is a separate, confirmed step." action={<Button variant="outline" onClick={() => setOpen(true)}>New campaign</Button>} />}>
        {(rows) => (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Country</TH>
                <TH>Status</TH>
                <TH numeric>Leads</TH>
                <TH>Tiles</TH>
                <TH>Spend / budget</TH>
                <TH numeric>Types</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => {
                const spend = toNumber(c.spendUsd), cap = toNumber(c.budgetUsdCap);
                const t = c.tiles;
                return (
                  <TR key={c.id} className="cursor-pointer" onClick={() => nav(`/campaigns/${c.id}`)}>
                    <TD>
                      <Link to={`/campaigns/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </TD>
                    <TD>{c.countryCode}</TD>
                    <TD>
                      <StatusLabel status={c.status} />
                    </TD>
                    <TD numeric>{fmtNum(c.leads)}</TD>
                    <TD className="min-w-44">
                      <div className="flex items-center gap-3">
                        <Progress value={t.done + t.saturated} max={t.total} label={`${c.name} tiles`} className="w-24" />
                        <span className="text-sm text-muted-fg tabular-nums">
                          {t.done + t.saturated}/{t.total}
                          {t.failed > 0 && <span className="text-bad-fg"> · {t.failed} failed</span>}
                        </span>
                      </div>
                    </TD>
                    <TD className="min-w-48">
                      <div className="flex items-center gap-3">
                        <Progress value={spend} max={cap} tone={cap > 0 && spend / cap >= 0.9 ? 'critical' : 'primary'} label={`${c.name} spend`} className="w-24" />
                        <span className="text-sm text-muted-fg tabular-nums">
                          {fmtUsd(spend)} / {fmtUsd(cap, 0)}
                        </span>
                      </div>
                    </TD>
                    <TD numeric title={c.includedTypes.join(', ')}>
                      {c.includedTypes.length}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </QueryState>
      <CreateCampaignDialog open={open} onClose={() => setOpen(false)} onCreated={(id) => nav(`/campaigns/${id}`)} />
    </>
  );
}
