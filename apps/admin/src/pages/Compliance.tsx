import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ShieldAlert, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtDate, fmtNum, relTime } from '@/lib/utils';
import { PageHeader, QueryState, Section, Tabs, TabsList, TabsTrigger, TabsContent, Button, Input, Field, Textarea, Badge, Note, Switch, Table, THead, TBody, TR, TH, TD, EmptyState, JsonView, KV, ConfirmDialog, StatTile } from '@/components/ui';
import type { JurisdictionRow } from '@/lib/types';

export function CompliancePage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'jurisdictions';
  return (
    <>
      <PageHeader title="Compliance" description="Jurisdiction policies (fail closed), the append-only suppression list, the audit log and retention." />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList aria-label="Compliance sections" className="h-auto flex-wrap">
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

const BOOLS: { k: keyof JurisdictionRow; label: string }[] = [
  { k: 'b2bColdEmailAllowed', label: 'B2B cold email' },
  { k: 'soleTraderTreatedAsIndividual', label: 'Sole trader = individual' },
  { k: 'priorConsentRequired', label: 'Prior consent required' },
  { k: 'requiresPhysicalAddressInFooter', label: 'Postal address in footer' },
  { k: 'requiresDataSourceDisclosure', label: 'Data source disclosure' },
  { k: 'confirmedByCounsel', label: 'Confirmed by counsel' },
];

function blank(cc: string): JurisdictionRow {
  return { countryCode: cc, b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: '', confirmedByCounsel: false };
}

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
    <div className="space-y-3">
      <Note>
        A country with no row is <strong>blocked</strong> (fail closed). <code>priorConsentRequired</code> blocks email entirely; leads there fall back to phone/postal. Opt-out window must be ≤ 72h. Have counsel confirm each row before go-live.
      </Note>
      <QueryState query={q} empty={<EmptyState title="No jurisdiction policies" description="Every country is blocked until you add one." />}>
        {() => (
          <Table>
            <THead>
              <tr>
                <TH>CC</TH>
                <TH>Status</TH>
                {BOOLS.map((b) => <TH key={b.k}>{b.label}</TH>)}
                <TH>Max follow-ups</TH>
                <TH>Opt-out h</TH>
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
                  <TR key={r.countryCode} className={cn(blocked && 'bg-critical-bg/40')}>
                    <TD className="font-mono font-semibold">{r.countryCode}</TD>
                    <TD>
                      {blocked ? (
                        <Badge variant="critical"><ShieldAlert className="size-3" aria-hidden /> BLOCKED{r.priorConsentRequired ? ' (consent)' : ''}</Badge>
                      ) : (
                        <Badge variant="success">email allowed</Badge>
                      )}
                      {!r.confirmedByCounsel && <div className="mt-1 text-xs text-warning">unconfirmed</div>}
                    </TD>
                    {BOOLS.map((b) => (
                      <TD key={b.k}>
                        <Switch label={`${b.label} ${r.countryCode}`} checked={Boolean(r[b.k])} onCheckedChange={(v) => edit(r.countryCode, { [b.k]: v })} />
                      </TD>
                    ))}
                    <TD><Input aria-label={`Max follow-ups ${r.countryCode}`} type="number" min={0} max={3} className="w-16" value={r.maxFollowUps} onChange={(e) => edit(r.countryCode, { maxFollowUps: Number(e.target.value) })} /></TD>
                    <TD><Input aria-label={`Opt-out window hours ${r.countryCode}`} type="number" min={0} max={72} className={cn('w-16', r.optOutHonourWindowHours > 72 && 'border-critical')} value={r.optOutHonourWindowHours} onChange={(e) => edit(r.countryCode, { optOutHonourWindowHours: Number(e.target.value) })} /></TD>
                    <TD><Input aria-label={`Language ${r.countryCode}`} className="w-14" value={r.defaultLanguageCode} onChange={(e) => edit(r.countryCode, { defaultLanguageCode: e.target.value })} /></TD>
                    <TD><Input aria-label={`Currency ${r.countryCode}`} className="w-16" value={r.defaultCurrency} onChange={(e) => edit(r.countryCode, { defaultCurrency: e.target.value.toUpperCase() })} /></TD>
                    <TD className="min-w-56"><Textarea aria-label={`Notes ${r.countryCode}`} rows={2} className="min-h-0 text-xs" value={r.notes} onChange={(e) => edit(r.countryCode, { notes: e.target.value })} /></TD>
                    <TD>
                      <Button size="sm" disabled={!dirty || r.optOutHonourWindowHours > 72} loading={save.isPending && save.variables?.countryCode === r.countryCode} onClick={() => save.mutate(r)}>Save</Button>
                      {r.updatedAt && <div className="mt-1 text-xs text-muted-fg">{relTime(r.updatedAt)}</div>}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </QueryState>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const cc = newCc.trim().toUpperCase(); if (/^[A-Z]{2}$/.test(cc) && !rows.some((r) => r.countryCode === cc)) { edit(cc, {}); setNewCc(''); } }}>
        <Field label="Add country (ISO-2)" htmlFor="new-cc" hint="Starts fully blocked; flip toggles then save.">
          <Input id="new-cc" className="w-24" maxLength={2} value={newCc} onChange={(e) => setNewCc(e.target.value.toUpperCase())} />
        </Field>
        <Button type="submit" variant="outline">Add row</Button>
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
  return (
    <div className="space-y-4">
      <Note tone="warning" className="flex items-start gap-2">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>Append-only. There is no delete anywhere in this console.</strong> Suppression is permanent; removal requires a database migration with an audit note. Emails are stored as SHA-256 hashes of the lowercased address, so search by email hashes your input server-side.
        </span>
      </Note>
      <Section title="Add suppression" description="Unsubscribes, bounces, complaints, hostile replies and takedowns are added automatically; use this for manual requests.">
        <div className="grid gap-2 sm:grid-cols-5 items-end">
          <Field label="Email" htmlFor="sup-email"><Input id="sup-email" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
          <Field label="Place id" htmlFor="sup-place"><Input id="sup-place" value={add.placeId} onChange={(e) => setAdd({ ...add, placeId: e.target.value })} /></Field>
          <Field label="Domain" htmlFor="sup-domain"><Input id="sup-domain" value={add.domain} onChange={(e) => setAdd({ ...add, domain: e.target.value })} /></Field>
          <Field label="Reason" htmlFor="sup-reason"><Input id="sup-reason" value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></Field>
          <Button variant="destructive" disabled={targets.length === 0} onClick={() => setConfirm(true)}>Add suppression…</Button>
          <Field label="Note" htmlFor="sup-note" className="sm:col-span-5"><Input id="sup-note" value={add.note} onChange={(e) => setAdd({ ...add, note: e.target.value })} /></Field>
        </div>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => addMut.mutateAsync()} title="Add to the suppression list" confirmLabel="Suppress permanently" destructive typeToConfirm="SUPPRESS" blastRadius={<><strong>Permanent and irreversible from the UI.</strong> {targets.join(', ')} will never be contacted again; every lead matching it is blocked at dispatch time and queued messages are cancelled.</>} />
      </Section>
      <Section title="Search" description={q.data ? `${fmtNum(q.data.total)} entries match` : undefined}>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Email" htmlFor="sq-email"><Input id="sq-email" value={email} onChange={(e) => { setPage(0); setEmail(e.target.value); }} /></Field>
          <Field label="Place id" htmlFor="sq-place"><Input id="sq-place" value={placeId} onChange={(e) => { setPage(0); setPlaceId(e.target.value); }} /></Field>
          <Field label="Domain" htmlFor="sq-domain"><Input id="sq-domain" value={domain} onChange={(e) => { setPage(0); setDomain(e.target.value); }} /></Field>
          <Field label="Reason" htmlFor="sq-reason"><Input id="sq-reason" value={reason} onChange={(e) => { setPage(0); setReason(e.target.value); }} /></Field>
        </div>
        <QueryState query={q} empty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <Table>
                <THead>
                  <tr><TH>Email hash</TH><TH>Place id</TH><TH>Domain</TH><TH>Reason</TH><TH>Note</TH><TH>Added</TH></tr>
                </THead>
                <TBody>
                  {d.items.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-mono text-xs">{s.emailHash ? `${s.emailHash.slice(0, 16)}…` : '—'}</TD>
                      <TD className="font-mono text-xs">{s.placeId ?? '—'}</TD>
                      <TD>{s.domain ?? '—'}</TD>
                      <TD><Badge variant="outline">{s.reason}</Badge></TD>
                      <TD className="text-xs">{s.note ?? '—'}</TD>
                      <TD className="text-xs text-muted-fg">{fmtDate(s.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>page {page + 1} of {Math.max(1, Math.ceil(d.total / TAKE))}</span>
                <Button size="sm" variant="outline" disabled={(page + 1) * TAKE >= d.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </>
          )}
        </QueryState>
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
  return (
    <Section title="Audit log" description="Every send, consent-relevant decision, override and suppression event. Retained 24 months.">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Action" htmlFor="au-action"><Input id="au-action" value={action} onChange={(e) => { setPage(0); setAction(e.target.value); }} placeholder="e.g. outreach.send" /></Field>
        <Field label="Lead id" htmlFor="au-lead"><Input id="au-lead" className="font-mono text-xs" value={leadId} onChange={(e) => { setPage(0); setLeadId(e.target.value); }} /></Field>
        <Field label="Since" htmlFor="au-since"><Input id="au-since" type="datetime-local" value={since} onChange={(e) => { setPage(0); setSince(e.target.value); }} /></Field>
        <Field label="Until" htmlFor="au-until"><Input id="au-until" type="datetime-local" value={until} onChange={(e) => { setPage(0); setUntil(e.target.value); }} /></Field>
      </div>
      <QueryState query={q} empty={<EmptyState title="No audit entries match" />}>
        {(rows) => (
          <>
            <Table>
              <THead>
                <tr><TH>When</TH><TH>Action</TH><TH>Actor</TH><TH>Lead</TH><TH>Subject</TH><TH>Detail</TH></tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-xs text-muted-fg">{fmtDate(r.createdAt)}</TD>
                    <TD className="font-mono text-xs">{r.action}</TD>
                    <TD>{r.actor}</TD>
                    <TD className="font-mono text-xs">{r.leadId ? <Link className="text-primary hover:underline" to={`/leads/${r.leadId}`}>{r.leadId.slice(0, 10)}…</Link> : '—'}</TD>
                    <TD className="font-mono text-xs">{r.subjectId ?? '—'}</TD>
                    <TD><JsonView value={r.detail} collapsed /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>page {page + 1}</span>
              <Button size="sm" variant="outline" disabled={rows.length < TAKE} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </>
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Expired snapshots pending purge" value={fmtNum(r.expiredSnapshotsPending)} tone={r.expiredSnapshotsPending > 0 ? 'warning' : 'default'} hint="Google content past its 30-day window" />
            <StatTile label="Snapshots total" value={fmtNum(r.snapshotsTotal)} />
            <StatTile label="Suppressions" value={fmtNum(r.suppressions)} />
            <StatTile label="Last run" value={r.lastRun ? relTime(r.lastRun) : 'never'} hint={r.lastRun ? fmtDate(r.lastRun) : 'nightly at 03:00'} />
          </div>
          <Section title="Policy" actions={<Button onClick={() => setConfirm(true)}>Run retention now</Button>}>
            <KV items={Object.entries(r.policy ?? {}).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])} />
            {r.lastResult && (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-fg">Last result</div>
                <JsonView value={r.lastResult} />
              </div>
            )}
          </Section>
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => run.mutateAsync()} title="Run the retention job now" confirmLabel="Run now" blastRadius={<>Purges <strong>{fmtNum(r.expiredSnapshotsPending)}</strong> expired Google snapshots, contact data for leads untouched for 90 days, and objection records older than 30 days (suppression hashes are kept). This is irreversible.</>} />
        </div>
      )}
    </QueryState>
  );
}
