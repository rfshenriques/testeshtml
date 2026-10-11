import * as React from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type SortingState, type RowSelectionState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { VERTICALS } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtNum, relTime } from '@/lib/utils';
import { Button, PageHeader, Input, Select, StageBadge, GateBadge, Badge, ConfirmDialog, Field, Textarea, ErrorState, Loading, EmptyState, Checkbox } from '@/components/ui';
import type { LeadAction, LeadSummary, LeadsQuery } from '@/lib/types';
import { LEAD_STAGES, WEBSITE_STATUSES } from '@/lib/types';
import { LeadDrawer } from './LeadDrawer';

const col = createColumnHelper<LeadSummary>();
const ROW_H = 44;

const BULK: { action: LeadAction; label: string; confirm?: boolean; destructive?: boolean }[] = [
  { action: 'requalify', label: 'Requalify' },
  { action: 'enrich', label: 'Enrich' },
  { action: 'profile', label: 'Profile' },
  { action: 'generate', label: 'Generate' },
  { action: 'quote', label: 'Quote' },
  { action: 'enqueue_outreach', label: 'Enqueue outreach', confirm: true },
  { action: 'suppress', label: 'Suppress', confirm: true, destructive: true },
];

export function LeadsPage() {
  const nav = useNavigate();
  const { id: openLeadId } = useParams();
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const qc = useQueryClient();

  const filters: LeadsQuery = {
    campaignId: sp.get('campaignId') || undefined,
    stage: sp.get('stage') || undefined,
    legalGate: sp.get('legalGate') || undefined,
    countryCode: sp.get('countryCode') || undefined,
    vertical: sp.get('vertical') || undefined,
    websiteStatus: sp.get('websiteStatus') || undefined,
    minScore: sp.get('minScore') ? Number(sp.get('minScore')) : undefined,
    q: sp.get('q') || undefined,
    sort: (sp.get('sort') as LeadsQuery['sort']) || 'score',
    dir: (sp.get('dir') as LeadsQuery['dir']) || 'desc',
  };
  const setFilter = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };
  const [search, setSearch] = React.useState(filters.q ?? '');
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? '') !== search) setFilter('q', search);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const campaigns = useQuery({ queryKey: keys.campaigns, queryFn: api.campaigns.list, staleTime: 60_000 });

  const query = useInfiniteQuery({
    queryKey: [...keys.leads, filters],
    queryFn: ({ pageParam }) => api.leads.list({ ...filters, take: 50, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = React.useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const sorting: SortingState = [{ id: filters.sort ?? 'score', desc: (filters.dir ?? 'desc') === 'desc' }];
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const columns = React.useMemo(
    () => [
      col.display({
        id: 'select',
        size: 36,
        header: ({ table }) => (
          <Checkbox aria-label="Select all loaded rows" checked={table.getIsAllRowsSelected()} ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected(); }} onChange={table.getToggleAllRowsSelectedHandler()} />
        ),
        cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.businessName}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} />,
      }),
      col.accessor('businessName', {
        header: 'Business',
        size: 260,
        cell: (c) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{c.getValue()}</div>
            <div className="truncate text-xs text-muted-fg">
              {c.row.original.city ?? '—'} · {c.row.original.primaryType ?? 'no type'}
            </div>
          </div>
        ),
      }),
      col.accessor('stage', { header: 'Stage', size: 120, cell: (c) => <StageBadge stage={c.getValue()} /> }),
      col.accessor('score', { id: 'score', header: 'Score', size: 70, enableSorting: true, cell: (c) => <span className="font-mono tabular-nums">{c.getValue() == null ? '—' : c.getValue()!.toFixed(2)}</span> }),
      col.accessor('legalGate', { header: 'Gate', size: 110, cell: (c) => <GateBadge gate={c.getValue()} reason={c.row.original.legalGateReason} /> }),
      col.accessor('websiteStatus', { header: 'Website', size: 100, cell: (c) => <Badge variant="outline">{c.getValue()}</Badge> }),
      col.accessor('vertical', { header: 'Vertical', size: 110, cell: (c) => c.getValue() ?? '—' }),
      col.accessor('countryCode', { header: 'CC', size: 50 }),
      col.accessor((r) => r.primaryContact, {
        id: 'contact',
        header: 'Primary contact',
        size: 220,
        cell: (c) => {
          const v = c.getValue();
          return v ? (
            <div className="min-w-0">
              <div className="truncate">{v.email}</div>
              <div className="text-xs text-muted-fg">
                {v.verification} · {v.source}
              </div>
            </div>
          ) : (
            <span className="text-muted-fg">none</span>
          );
        },
      }),
      col.accessor('priority', { id: 'priority', header: 'Prio', size: 60, enableSorting: true, cell: (c) => <span className="tabular-nums">{c.getValue()}</span> }),
      col.accessor('lastTouchAt', { id: 'lastTouchAt', header: 'Last touch', size: 100, enableSorting: true, cell: (c) => <span className="text-xs text-muted-fg">{relTime(c.getValue())}</span> }),
      col.accessor('createdAt', { id: 'createdAt', header: 'Created', size: 100, enableSorting: true, cell: (c) => <span className="text-xs text-muted-fg">{relTime(c.getValue())}</span> }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    state: { sorting, rowSelection },
    onSortingChange: (u) => {
      const next = typeof u === 'function' ? u(sorting) : u;
      const s = next[0];
      if (!s) return;
      const n = new URLSearchParams(sp);
      n.set('sort', s.id);
      n.set('dir', s.desc ? 'desc' : 'asc');
      setSp(n, { replace: true });
    },
    onRowSelectionChange: setRowSelection,
    getRowId: (r) => r.id,
    enableSorting: true,
  });

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const items = virt.getVirtualItems();
  React.useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 10 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [items, rows.length, query]);

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const [pending, setPending] = React.useState<{ action: LeadAction; label: string; destructive?: boolean } | null>(null);
  const [reason, setReason] = React.useState('');
  const bulk = useMutation({
    mutationFn: ({ action, payload }: { action: LeadAction; payload?: Record<string, unknown> }) => api.leads.bulk(selectedIds, action, payload),
    onSuccess: (r, v) => {
      const failed = r.results?.filter((x) => !x.ok) ?? [];
      toast.success(`${v.action.replace(/_/g, ' ')}: ${r.enqueued ?? selectedIds.length - failed.length} lead(s)`, failed.length ? `${failed.length} failed: ${failed.slice(0, 3).map((f) => f.error).join('; ')}` : undefined);
      setPending(null);
      setReason('');
      setRowSelection({});
      void qc.invalidateQueries({ queryKey: keys.leads });
    },
  });
  const runBulk = (b: (typeof BULK)[number]) => {
    if (b.confirm) setPending(b);
    else bulk.mutate({ action: b.action });
  };

  const clearFilters = () => {
    setSp(new URLSearchParams(), { replace: true });
    setSearch('');
  };
  const activeFilters = ['campaignId', 'stage', 'legalGate', 'countryCode', 'vertical', 'websiteStatus', 'minScore', 'q'].filter((k) => sp.get(k));

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader title="Leads" description={`${fmtNum(total)} matching · ${rows.length} loaded`} />
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-fg" aria-hidden />
          <Input aria-label="Search leads" className="w-56 pl-8" placeholder="Search name / place id" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Campaign" className="w-44" value={filters.campaignId ?? ''} onChange={(e) => setFilter('campaignId', e.target.value)}>
          <option value="">All campaigns</option>
          {campaigns.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Stage" className="w-36" value={filters.stage ?? ''} onChange={(e) => setFilter('stage', e.target.value)}>
          <option value="">Any stage</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select aria-label="Legal gate" className="w-32" value={filters.legalGate ?? ''} onChange={(e) => setFilter('legalGate', e.target.value)}>
          <option value="">Any gate</option>
          <option value="pending">pending</option>
          <option value="clear">clear</option>
          <option value="blocked">blocked</option>
        </Select>
        <Select aria-label="Website status" className="w-32" value={filters.websiteStatus ?? ''} onChange={(e) => setFilter('websiteStatus', e.target.value)}>
          <option value="">Any website</option>
          {WEBSITE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select aria-label="Vertical" className="w-36" value={filters.vertical ?? ''} onChange={(e) => setFilter('vertical', e.target.value)}>
          <option value="">Any vertical</option>
          {VERTICALS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        <Input aria-label="Country code" className="w-20" placeholder="CC" maxLength={2} value={filters.countryCode ?? ''} onChange={(e) => setFilter('countryCode', e.target.value.toUpperCase())} />
        <Input aria-label="Minimum score" className="w-24" type="number" step="0.05" min={0} max={1} placeholder="min score" value={filters.minScore ?? ''} onChange={(e) => setFilter('minScore', e.target.value)} />
        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="size-3.5" aria-hidden /> Clear ({activeFilters.length})
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-accent p-2 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-medium">{selectedIds.length} selected</span>
          {BULK.map((b) => (
            <Button key={b.action} size="sm" variant={b.destructive ? 'destructive' : 'outline'} onClick={() => runBulk(b)} loading={bulk.isPending && bulk.variables?.action === b.action}>
              {b.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 rounded-md border bg-card">
        {query.isError ? (
          <div className="p-3">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : query.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState className="m-3" title="No leads match" description={activeFilters.length ? 'Try clearing a filter.' : 'Leads appear once a campaign has run discovery.'} />
        ) : (
          <div ref={parentRef} className="h-full overflow-auto" role="grid" aria-rowcount={total} aria-label="Leads table">
            <div className="sticky top-0 z-10 flex border-b bg-muted text-xs text-muted-fg" role="row">
              {table.getFlatHeaders().map((h) => {
                const sortable = h.column.getCanSort() && ['score', 'priority', 'lastTouchAt', 'createdAt'].includes(h.column.id);
                const dir = h.column.getIsSorted();
                return (
                  <div key={h.id} role="columnheader" aria-sort={dir ? (dir === 'desc' ? 'descending' : 'ascending') : undefined} style={{ width: h.getSize(), flex: h.column.id === 'businessName' ? '1 0 auto' : undefined }} className="flex h-9 shrink-0 items-center px-2 font-medium">
                    {sortable ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-50" aria-hidden />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
              {items.map((vi) => {
                const row = table.getRowModel().rows[vi.index]!;
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-rowindex={vi.index + 1}
                    aria-selected={row.getIsSelected()}
                    tabIndex={0}
                    data-index={vi.index}
                    ref={virt.measureElement}
                    onClick={() => nav(`/leads/${row.original.id}${location.search}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') nav(`/leads/${row.original.id}${location.search}`);
                      if (e.key === ' ') {
                        e.preventDefault();
                        row.toggleSelected();
                      }
                      if (e.key === 'ArrowDown') (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                      if (e.key === 'ArrowUp') (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
                    }}
                    className={cn('absolute left-0 flex w-full cursor-pointer items-center border-b text-sm hover:bg-muted/50 focus-visible:bg-accent focus-visible:outline-none', row.getIsSelected() && 'bg-accent/60', openLeadId === row.original.id && 'bg-accent')}
                    style={{ transform: `translateY(${vi.start}px)`, height: ROW_H }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div key={cell.id} role="gridcell" style={{ width: cell.column.getSize(), flex: cell.column.id === 'businessName' ? '1 0 auto' : undefined }} className="min-w-0 shrink-0 px-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {query.isFetchingNextPage && <Loading label="Loading more…" className="p-2" />}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && bulk.mutateAsync({ action: pending.action, payload: pending.action === 'suppress' ? { reason: 'operator', note: reason || undefined } : undefined })}
        title={pending?.label ?? ''}
        confirmLabel={pending?.label}
        destructive={pending?.destructive}
        typeToConfirm={pending?.action === 'suppress' ? 'SUPPRESS' : undefined}
        blastRadius={
          pending?.action === 'suppress' ? (
            <>
              <strong>{selectedIds.length} lead(s)</strong> will be permanently suppressed: their place ids and contact emails are added to the append-only suppression list. This cannot be undone from the UI; any queued messages for them are cancelled.
            </>
          ) : (
            <>
              <strong>{selectedIds.length} lead(s)</strong> will be enqueued for the outreach sequence. Each is re-checked at dispatch time against the legal gate, suppression and the per-mailbox daily cap (50). Leads failing the gate are skipped and reported.
            </>
          )
        }
      >
        {pending?.action === 'suppress' && (
          <Field label="Note (optional, logged)" htmlFor="bulk-suppress-note">
            <Textarea id="bulk-suppress-note" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </ConfirmDialog>

      {openLeadId && <LeadDrawer id={openLeadId} onClose={() => nav(`/leads${location.search}`)} />}
    </div>
  );
}
