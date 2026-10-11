import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { fmtUsd, fmtNum, toNumber } from '@/lib/utils';
import { Button, PageHeader, QueryState, Table, THead, TBody, TR, TH, TD, StatusBadge, Progress, EmptyState } from '@/components/ui';
import { CreateCampaignDialog } from './CreateCampaignDialog';

export function CampaignsPage() {
  const [open, setOpen] = React.useState(false);
  const nav = useNavigate();
  const q = useQuery({ queryKey: keys.campaigns, queryFn: api.campaigns.list, refetchInterval: 30_000 });
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Territory campaigns with explicit budget ceilings. A worldwide campaign is a queue of these, funded one at a time."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> New campaign
          </Button>
        }
      />
      <QueryState query={q} empty={<EmptyState title="No campaigns yet" description="Create a draft: territory, place types and a budget cap. Starting it is a separate, confirmed step." action={<Button onClick={() => setOpen(true)}>New campaign</Button>} />}>
        {(rows) => (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Country</TH>
                <TH>Status</TH>
                <TH>Leads</TH>
                <TH>Tiles</TH>
                <TH>Spend / budget</TH>
                <TH>Types</TH>
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
                      <StatusBadge status={c.status} />
                    </TD>
                    <TD className="tabular-nums">{fmtNum(c.leads)}</TD>
                    <TD className="min-w-40">
                      <div className="text-xs tabular-nums">
                        {t.done + t.saturated}/{t.total} done{t.failed > 0 && <span className="text-critical"> · {t.failed} failed</span>}
                      </div>
                      <Progress value={t.done + t.saturated} max={t.total} label={`${c.name} tiles`} className="mt-1" />
                    </TD>
                    <TD className="min-w-40">
                      <div className="text-xs tabular-nums">
                        {fmtUsd(spend)} / {fmtUsd(cap, 0)}
                      </div>
                      <Progress value={spend} max={cap} tone={cap > 0 && spend / cap >= 0.9 ? 'critical' : 'primary'} label={`${c.name} spend`} className="mt-1" />
                    </TD>
                    <TD className="max-w-60 truncate text-xs text-muted-fg" title={c.includedTypes.join(', ')}>
                      {c.includedTypes.length} types
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
