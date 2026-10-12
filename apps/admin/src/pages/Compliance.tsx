import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtDate, fmtNum, relTime } from '@/lib/utils';
import { PageHeader, QueryState, Section, Tabs, TabsList, TabsTrigger, TabsContent, Button, Input, Field, Switch, Table, THead, TBody, TR, TH, TD, CellSub, EmptyState, JsonView, KV, ConfirmDialog, StatTile, DotLabel, Disclosure, Pager, Loading } from '@/components/ui';
import type { JurisdictionRow } from '@/lib/types';

export function CompliancePage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'jurisdictions';
  return (
    <>
      <PageHeader title="Compliance" description="Jurisdiction policies (fail closed), the append-only suppression list, the audit log and retention." />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList aria-label="Compliance sections">
          <TabsTrigger value="jurisdictions">Jurisdictions</TabsTrigger>
          <TabsTrigger value="suppressions">Suppression list</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
        </TabsList>
        <TabsContent value="jurisdictions"><Jurisdictions /></TabsContent>
        <TabsContent value="suppressions"><Suppressions /></TabsContent>
        <TabsContent value="audit"><Audit /></TabsContent>
        <TabsContent value="retention"><Retention /></TabsContent>
      </Tabs>
    </>
  );
}

const BOOLS: { k: keyof JurisdictionRow; label: string; aria: string }[] = [
  { k: 'b2bColdEmailAllowed', label: 'Cold email', aria: 'B2B cold email allowed' },
  { k: 'soleTraderTreatedAsIndividual', label: 'Sole trader', aria: 'Sole trader treated as individual' },
  { k: 'priorConsentRequired', label: 'Consent', aria: 'Prior consent required' },
  { k: 'requiresPhysicalAddressInFooter', label: 'Address', aria: 'Postal address in footer' },
  { k: 'requiresDataSourceDisclosure', label: 'Disclosure', aria: 'Data source disclosure' },
  { k: 'confirmedByCounsel', label: 'Counsel', aria: 'Confirmed by counsel' },
];

function blank(cc: string): JurisdictionRow {
  return { countryCode: cc, b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: '', confirmedByCounsel: false };
}

const cellInput = 'no-spin h-8 px-2 text-sm';

function Jurisdictions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...keys.compliance, 'jurisdictions'], queryFn: api.compliance.jurisdictions });
  const [edits, setEdits] = React.useState<Record<string, JurisdictionRow>>({});
  const [newCc, setNewCc] = React.useState('');
  const save = useMutation({
    mutationFn: (row: JurisdictionRow) => {
      const { countryCode, updatedAt: _u, ...body } = row;
      return api.compliance.putJurisdiction(countryCode, body);
    },
    onSuccess: (_r, row) => {
      toast.success(`Policy saved for ${row.countryCode}`);
      setEdits((e) => { const n = { ...e }; delete n[row.countryCode]; return n; });
      void qc.invalidateQueries({ queryKey: [...keys.compliance, 'jurisdictions'] });
    },
  });
  const rows = React.useMemo(() => {
    const base = new Map((q.data ?? []).map((r) => [r.countryCode, r]));
    for (const [cc, r] of Object.entries(edits)) base.set(cc, r);
    return Array.from(base.values()).sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  }, [q.data, edits]);
  const edit = (cc: string, patch: Partial<JurisdictionRow>) => {
    const cur = edits[cc] ?? q.data?.find((r) => r.countryCode === cc) ?? blank(cc);
    setEdits({ ...edits, [cc]: { ...cur, ...patch } });
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-base text-muted-fg">A country with no row is blocked. Have counsel confirm each row before go-live.</p>
        <Disclosure summary="How the gate reads these rows">
          <code>priorConsentRequired</code> blocks email entirely; leads there fall back to phone or postal outreach. The opt-out window must be ≤ 72h. Unconfirmed rows still apply but are flagged.
        </Disclosure>
      </div>
      <QueryState query={q} empty={<EmptyState title="No jurisdiction policies" description="Every country is blocked until you add one." />} loading={<Loading rows={4} />}>
        {() => (
          <Table>
            <THead>
              <tr>
                <TH>Country</TH>
                <TH>Status</TH>
                {BOOLS.map((b) => (
                  <TH key={b.k} title={b.aria}>
                    {b.label}
                  </TH>
                ))}
                <TH numeric>Follow-ups</TH>
                <TH numeric>Opt-out h</TH>
                <TH>Lang</TH>
                <TH>Currency</TH>
                <TH>Notes</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const dirty = !!edits[r.countryCode];
                const blocked = r.priorConsentRequired || !r.b2bColdEmailAllowed;
                return (
                  <TR key={r.countryCode}>
                    <TD className="font-mono font-semibold">{r.countryCode}</TD>
                    <TD>
                      {blocked ? <DotLabel tone="blocked">Blocked{r.priorConsentRequired ? ' (consent)' : ''}</DotLabel> : <DotLabel tone="good">Email allowed</DotLabel>}
                      {!r.confirmedByCounsel && <CellSub className="text-warn-fg">Unconfirmed</CellSub>}
                    </TD>
                    {BOOLS.map((b) => (
                      <TD key={b.k}>
                        <Switch label={`${b.aria} ${r.countryCode}`} checked={Boolean(r[b.k])} onCheckedChange={(v) => edit(r.countryCode, { [b.k]: v })} />
                      </TD>
                    ))}
                    <TD numeric>
                      <Input aria-label={`Max follow-ups ${r.countryCode}`} type="number" min={0} max={3} className={cn(cellInput, 'w-14 text-right')} value={r.maxFollowUps} onChange={(e) => edit(r.countryCode, { maxFollowUps: Number(e.target.value) })} />
                    </TD>
                    <TD numeric>
                      <Input aria-label={`Opt-out window hours ${r.countryCode}`} type="number" min={0} max={72} className={cn(cellInput, 'w-14 text-right', r.optOutHonourWindowHours > 72 && 'border-bad-dot')} value={r.optOutHonourWindowHours} onChange={(e) => edit(r.countryCode, { optOutHonourWindowHours: Number(e.target.value) })} />
                    </TD>
                    <TD>
                      <Input aria-label={`Language ${r.countryCode}`} className={cn(cellInput, 'w-12')} value={r.defaultLanguageCode} onChange={(e) => edit(r.countryCode, { defaultLanguageCode: e.target.value })} />
                    </TD>
                    <TD>
                      <Input aria-label={`Currency ${r.countryCode}`} className={cn(cellInput, 'w-16')} value={r.defaultCurrency} onChange={(e) => edit(r.countryCode, { defaultCurrency: e.target.value.toUpperCase() })} />
                    </TD>
                    <TD className="min-w-44">
                      <Input aria-label={`Notes ${r.countryCode}`} className="h-8 px-2 text-sm" value={r.notes} onChange={(e) => edit(r.countryCode, { notes: e.target.value })} />
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty || r.optOutHonourWindowHours > 72} loading={save.isPending && save.variables?.countryCode === r.countryCode} onClick={() => save.mutate(r)} title={r.updatedAt ? `Saved ${relTime(r.updatedAt)}` : undefined}>
                        Save
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </QueryState>
      <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); const cc = newCc.trim().toUpperCase(); if (/^[A-Z]{2}$/.test(cc) && !rows.some((r) => r.countryCode === cc)) { edit(cc, {}); setNewCc(''); } }}>
        <label htmlFor="new-cc" className="text-sm font-medium">
          Add country
        </label>
        <Input id="new-cc" className="w-20 text-center uppercase" maxLength={2} placeholder="ISO-2" value={newCc} onChange={(e) => setNewCc(e.target.value.toUpperCase())} />
        <Button type="submit" variant="outline">
          Add row
        </Button>
        <span className="text-sm text-muted-fg">Starts fully blocked; flip the toggles, then save.</span>
      </form>
    </div>
  );
}

function Suppressions() {
  const qc = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [placeId, setPlaceId] = React.useState('');
  const [domain, setDomain] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [page, setPage] = React.useState(0);
  const TAKE = 50;
  const q = useQuery({ queryKey: [...keys.compliance, 'suppressions', { email, placeId, domain, reason, page }], queryFn: () => api.compliance.suppressions({ email: email || undefined, placeId: placeId || undefined, domain: domain || undefined, reason: reason || undefined, take: TAKE, skip: page * TAKE }) });
  const [add, setAdd] = React.useState({ email: '', placeId: '', domain: '', reason: 'operator', note: '' });
  const [confirm, setConfirm] = React.useState(false);
  const addMut = useMutation({
    mutationFn: () => api.compliance.addSuppression({ email: add.email || undefined, placeId: add.placeId || undefined, domain: add.domain || undefined, reason: add.reason || undefined, note: add.note || undefined }),
    onSuccess: () => { toast.success('Suppression added (permanent)'); setConfirm(false); setAdd({ email: '', placeId: '', domain: '', reason: 'operator', note: '' }); void qc.invalidateQueries({ queryKey: [...keys.compliance, 'suppressions'] }); },
  });
  const targets = [add.email && `email ${add.email}`, add.placeId && `place ${add.placeId}`, add.domain && `domain ${add.domain}`].filter(Boolean);
  const anyFilter = !!(email || placeId || domain || reason);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-base text-muted-fg">Append-only. There is no delete anywhere in this console.</p>
        <Disclosure summary="How suppression works">
          Suppression is permanent; removal requires a database migration with an audit note. Emails are stored as SHA-256 hashes of the lowercased address, so searching by email hashes your input server-side. Unsubscribes, bounces, complaints, hostile replies and takedowns are added automatically.
        </Disclosure>
      </div>
      <Section title="Suppression list" description={q.data ? `${fmtNum(q.data.total)} entries match` : undefined}>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Input aria-label="Email" placeholder="Email" className="w-52" value={email} onChange={(e) => { setPage(0); setEmail(e.target.value); }} />
          <Input aria-label="Place id" placeholder="Place id" className="w-48" value={placeId} onChange={(e) => { setPage(0); setPlaceId(e.target.value); }} />
          <Input aria-label="Domain" placeholder="Domain" className="w-44" value={domain} onChange={(e) => { setPage(0); setDomain(e.target.value); }} />
          <Input aria-label="Reason" placeholder="Reason" className="w-36" value={reason} onChange={(e) => { setPage(0); setReason(e.target.value); }} />
          {anyFilter && (
            <Button variant="link" className="text-sm" onClick={() => { setEmail(''); setPlaceId(''); setDomain(''); setReason(''); setPage(0); }}>
              Clear filters
            </Button>
          )}
        </div>
        <QueryState query={q} empty={(d) => d.items.length === 0} loading={<Loading rows={5} />}>
          {(d) => (
            <div className="space-y-4">
              <Table bare>
                <THead>
                  <tr>
                    <TH>Email hash</TH>
                    <TH>Place id</TH>
                    <TH>Domain</TH>
                    <TH>Reason</TH>
                    <TH>Note</TH>
                    <TH>Added</TH>
                  </tr>
                </THead>
                <TBody>
                  {d.items.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-mono text-sm">{s.emailHash ? `${s.emailHash.slice(0, 16)}…` : '—'}</TD>
                      <TD className="font-mono text-sm">{s.placeId ?? '—'}</TD>
                      <TD>{s.domain ?? '—'}</TD>
                      <TD>{s.reason.replace(/_/g, ' ')}</TD>
                      <TD className="max-w-64 truncate text-sm text-muted-fg" title={s.note ?? undefined}>{s.note ?? '—'}</TD>
                      <TD className="text-sm whitespace-nowrap text-muted-fg">{fmtDate(s.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pager page={page} pages={Math.ceil(d.total / TAKE)} onPage={setPage} />
            </div>
          )}
        </QueryState>
      </Section>
      <Section title="Add suppression" description="For manual requests. At least one of email, place id or domain.">
        <div className="grid items-end gap-3 sm:grid-cols-4">
          <Field label="Email" htmlFor="sup-email"><Input id="sup-email" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
          <Field label="Place id" htmlFor="sup-place"><Input id="sup-place" value={add.placeId} onChange={(e) => setAdd({ ...add, placeId: e.target.value })} /></Field>
          <Field label="Domain" htmlFor="sup-domain"><Input id="sup-domain" value={add.domain} onChange={(e) => setAdd({ ...add, domain: e.target.value })} /></Field>
          <Field label="Reason" htmlFor="sup-reason"><Input id="sup-reason" value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></Field>
          <Field label="Note" htmlFor="sup-note" className="sm:col-span-3"><Input id="sup-note" value={add.note} onChange={(e) => setAdd({ ...add, note: e.target.value })} /></Field>
          <Button variant="destructive" disabled={targets.length === 0} onClick={() => setConfirm(true)}>Add suppression…</Button>
        </div>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => addMut.mutateAsync()} title="Add to the suppression list" confirmLabel="Suppress permanently" destructive typeToConfirm="SUPPRESS" blastRadius={<><strong>Permanent and irreversible from the UI.</strong> {targets.join(', ')} will never be contacted again; every lead matching it is blocked at dispatch time and queued messages are cancelled.</>} />
      </Section>
    </div>
  );
}

function Audit() {
  const [action, setAction] = React.useState('');
  const [leadId, setLeadId] = React.useState('');
  const [since, setSince] = React.useState('');
  const [until, setUntil] = React.useState('');
  const [page, setPage] = React.useState(0);
  const TAKE = 100;
  const q = useQuery({
    queryKey: [...keys.compliance, 'audit', { action, leadId, since, until, page }],
    queryFn: () => api.compliance.audit({ action: action || undefined, leadId: leadId || undefined, since: since ? new Date(since).toISOString() : undefined, until: until ? new Date(until).toISOString() : undefined, take: TAKE, skip: page * TAKE }),
  });
  const anyFilter = !!(action || leadId || since || until);
  return (
    <Section title="Audit log" description="Every send, consent-relevant decision, override and suppression event. Retained 24 months.">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input aria-label="Action" placeholder="Action, e.g. outreach.send" className="w-56" value={action} onChange={(e) => { setPage(0); setAction(e.target.value); }} />
        <Input aria-label="Lead id" placeholder="Lead id" className="w-56 font-mono text-sm" value={leadId} onChange={(e) => { setPage(0); setLeadId(e.target.value); }} />
        <Field label="Since" htmlFor="au-since" className="flex-row items-center gap-2">
          <Input id="au-since" type="datetime-local" className="w-52" value={since} onChange={(e) => { setPage(0); setSince(e.target.value); }} />
        </Field>
        <Field label="Until" htmlFor="au-until" className="flex-row items-center gap-2">
          <Input id="au-until" type="datetime-local" className="w-52" value={until} onChange={(e) => { setPage(0); setUntil(e.target.value); }} />
        </Field>
        {anyFilter && (
          <Button variant="link" className="text-sm" onClick={() => { setAction(''); setLeadId(''); setSince(''); setUntil(''); setPage(0); }}>
            Clear filters
          </Button>
        )}
      </div>
      <QueryState query={q} empty={<EmptyState title="No audit entries match" />} loading={<Loading rows={6} />}>
        {(rows) => (
          <div className="space-y-4">
            <Table bare>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Action</TH>
                  <TH>Actor</TH>
                  <TH>Lead</TH>
                  <TH>Subject</TH>
                  <TH>Detail</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="text-sm whitespace-nowrap text-muted-fg">{fmtDate(r.createdAt)}</TD>
                    <TD className="font-mono text-sm">{r.action}</TD>
                    <TD>{r.actor}</TD>
                    <TD className="font-mono text-sm">{r.leadId ? <Link className="text-primary hover:underline" to={`/leads/${r.leadId}`}>{r.leadId.slice(0, 10)}…</Link> : '—'}</TD>
                    <TD className="max-w-48 truncate font-mono text-sm" title={r.subjectId ?? undefined}>{r.subjectId ?? '—'}</TD>
                    <TD>
                      <JsonView value={r.detail} collapsed label="detail" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pager page={page} onPage={setPage} hasNext={rows.length >= TAKE} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function Retention() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...keys.compliance, 'retention'], queryFn: api.compliance.retention, refetchInterval: 60_000 });
  const [confirm, setConfirm] = React.useState(false);
  const run = useMutation({ mutationFn: api.compliance.runRetention, onSuccess: () => { toast.success('Retention job started'); setConfirm(false); void qc.invalidateQueries({ queryKey: [...keys.compliance, 'retention'] }); } });
  return (
    <QueryState query={q}>
      {(r) => (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Expired snapshots pending purge" value={fmtNum(r.expiredSnapshotsPending)} tone={r.expiredSnapshotsPending > 0 ? 'warning' : 'default'} hint="Google content past its 30-day window" />
            <StatTile label="Snapshots total" value={fmtNum(r.snapshotsTotal)} />
            <StatTile label="Suppressions" value={fmtNum(r.suppressions)} />
            <StatTile label="Last run" value={r.lastRun ? relTime(r.lastRun) : 'never'} hint={r.lastRun ? fmtDate(r.lastRun) : 'Nightly at 03:00'} />
          </div>
          <Section title="Policy" actions={<Button variant="outline" onClick={() => setConfirm(true)}>Run retention now</Button>}>
            <KV items={Object.entries(r.policy ?? {}).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])} />
            {r.lastResult && (
              <div className="mt-4 border-t pt-4">
                <JsonView value={r.lastResult} collapsed label="last result" />
              </div>
            )}
          </Section>
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => run.mutateAsync()} title="Run the retention job now" confirmLabel="Run now" blastRadius={<>Purges <strong>{fmtNum(r.expiredSnapshotsPending)}</strong> expired Google snapshots, contact data for leads untouched for 90 days, and objection records older than 30 days (suppression hashes are kept). This is irreversible.</>} />
        </div>
      )}
    </QueryState>
  );
}
