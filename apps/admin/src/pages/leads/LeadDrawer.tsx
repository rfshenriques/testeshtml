import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ExternalLink, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtDate, fmtMoney, relTime, titleCase } from '@/lib/utils';
import { Dialog, Tabs, TabsList, TabsTrigger, TabsContent, KV, JsonView, StageBadge, GateBadge, Badge, StatusBadge, Button, Input, Select, Textarea, Field, ConfirmDialog, Note, EmptyState, Loading, ErrorState, Section, Table, THead, TBody, TR, TH, TD, Checkbox } from '@/components/ui';
import { ScoreBreakdownView } from '@/components/ScoreBreakdown';
import type { LeadDetail, LeadAction, TierName } from '@/lib/types';
import { QuotePreviewTool } from '@/pages/Pricing';

const MANUAL_ACTIONS: { action: LeadAction; label: string; confirm?: 'send' | 'suppress' | 'publish'; destructive?: boolean }[] = [
  { action: 'requalify', label: 'Requalify' },
  { action: 'enrich', label: 'Enrich (find email)' },
  { action: 'verify', label: 'Verify contact' },
  { action: 'profile', label: 'Profile (classify)' },
  { action: 'generate', label: 'Generate site' },
  { action: 'publish', label: 'Publish preview', confirm: 'publish' },
  { action: 'quote', label: 'Create quote' },
  { action: 'enqueue_outreach', label: 'Enqueue outreach', confirm: 'send' },
  { action: 'stop_sequence', label: 'Stop sequence' },
  { action: 'mark_won', label: 'Mark won' },
  { action: 'mark_lost', label: 'Mark lost' },
  { action: 'suppress', label: 'Suppress', confirm: 'suppress', destructive: true },
];

export function LeadDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.lead(id), queryFn: () => api.leads.get(id) });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.lead(id) });
    void qc.invalidateQueries({ queryKey: keys.leads });
  };
  const d = q.data;
  return (
    <Dialog open onClose={onClose} side="right" title={d ? d.lead.businessName : 'Lead'} description={d ? <span className="flex flex-wrap items-center gap-2"><StageBadge stage={d.lead.stage} /> <GateBadge gate={d.lead.legalGate} reason={d.lead.legalGateReason} /> <span>{d.lead.city ?? ''} {d.lead.countryCode}</span> <span className="font-mono text-xs">{d.lead.id}</span></span> : undefined}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d ? <LeadBody d={d} refresh={invalidate} /> : null}
    </Dialog>
  );
}

function LeadBody({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const { lead } = d;
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Lead sections" className="flex-wrap h-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="contacts" badge={d.contacts.length}>Contacts</TabsTrigger>
        <TabsTrigger value="site">Site & quote</TabsTrigger>
        <TabsTrigger value="outreach" badge={d.messages.length + d.replies.length}>Outreach</TabsTrigger>
        <TabsTrigger value="timeline" badge={d.events.length}>Timeline</TabsTrigger>
        <TabsTrigger value="review" badge={d.reviewItems.filter((r) => r.status === 'open').length}>Review</TabsTrigger>
        <TabsTrigger value="gate">Gate</TabsTrigger>
        <TabsTrigger value="actions">Notes & actions</TabsTrigger>
      </TabsList>
      <TabsContent value="overview"><Overview d={d} /></TabsContent>
      <TabsContent value="contacts"><Contacts d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="site"><SiteQuote d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="outreach"><Outreach d={d} /></TabsContent>
      <TabsContent value="timeline"><Timeline d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="review"><ReviewTab d={d} /></TabsContent>
      <TabsContent value="gate"><GateTab d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="actions"><ActionsTab lead={lead} refresh={refresh} messageCount={d.messages.length} /></TabsContent>
    </Tabs>
  );
}

function Overview({ d }: { d: LeadDetail }) {
  const { lead, snapshot } = d;
  const raw = (snapshot?.raw ?? {}) as Record<string, unknown>;
  const addr = (raw.formattedAddress as string) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Summary">
        <KV
          items={[
            ['Score', lead.score == null ? '—' : <span className="font-mono">{lead.score.toFixed(2)}</span>],
            ['Stage', <StageBadge key="s" stage={lead.stage} />],
            ['Legal gate', <span key="g"><GateBadge gate={lead.legalGate} /> {lead.legalGateReason && <span className="text-xs text-muted-fg">{lead.legalGateReason}</span>}</span>],
            ['Website', <span key="w"><Badge variant="outline">{lead.websiteStatus}</Badge> {lead.websiteUrl && <a className="ml-1 text-primary hover:underline" href={lead.websiteUrl} target="_blank" rel="noreferrer noopener">{lead.websiteUrl}</a>}</span>],
            ['Type / vertical', `${lead.primaryType ?? '—'} / ${lead.vertical ?? '—'}`],
            ['Rating', lead.rating == null ? '—' : <span key="r" className="inline-flex items-center gap-1"><Star className="size-3" aria-hidden /> {lead.rating} ({lead.reviewCount ?? 0} reviews)</span>],
            ['Phone', lead.phone],
            ['Address', addr],
            ['Business status', lead.businessStatus],
            ['Price level', lead.priceLevel],
            ['Coordinates', lead.lat != null && lead.lng != null ? `${lead.lat.toFixed(5)}, ${lead.lng.toFixed(5)}` : '—'],
            ['Place id', <span key="p" className="font-mono text-xs">{lead.placeId}</span>],
            ['Campaign', <Link key="c" className="text-primary hover:underline" to={`/campaigns/${lead.campaignId}`}>{lead.campaignId}</Link>],
            ['Fallback channel', lead.fallbackChannel],
            ['Priority', lead.priority],
            ['Preview', lead.previewUrl ? <a key="pv" className="inline-flex items-center gap-1 text-primary hover:underline" href={lead.previewUrl} target="_blank" rel="noreferrer noopener">{lead.previewUrl} <ExternalLink className="size-3" aria-hidden /></a> : '—'],
            ['Quote', lead.quoteUrl ? <a key="qu" className="inline-flex items-center gap-1 text-primary hover:underline" href={lead.quoteUrl} target="_blank" rel="noreferrer noopener">{lead.quoteUrl} <ExternalLink className="size-3" aria-hidden /></a> : '—'],
            ['Created / last touch', `${fmtDate(lead.createdAt)} / ${fmtDate(lead.lastTouchAt)}`],
          ]}
        />
      </Section>
      <Section title="Score breakdown" description="Why this lead ranks where it does (spec §6.3).">
        <ScoreBreakdownView breakdown={lead.scoreBreakdown} score={lead.score} />
      </Section>
      <Section title="Classification" description="LLM output with confidence; low confidence routes to the review queue.">
        {lead.classification ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={lead.classification.confidence >= 0.7 ? 'success' : 'warning'}>confidence {(lead.classification.confidence * 100).toFixed(0)}%</Badge>
              {lead.classification.insufficientData && <Badge variant="critical">insufficient data</Badge>}
            </div>
            <KV
              items={[
                ['Vertical', `${lead.classification.vertical} / ${lead.classification.subVertical}`],
                ['Services', lead.classification.servicesOffered.join(', ')],
                ['Differentiators', lead.classification.differentiators.join(', ') || '—'],
                ['Tone / CTA', `${lead.classification.toneOfVoice} / ${lead.classification.primaryCTA}`],
                ['Language', lead.classification.languageCode],
              ]}
            />
            <div className="text-xs text-muted-fg">Inputs: the Places snapshot below (name, types, reviews, editorial summary).</div>
          </div>
        ) : (
          <div className="text-sm text-muted-fg">Not profiled yet.</div>
        )}
      </Section>
      <Section title="Google Places snapshot" description={snapshot ? `${snapshot.kind} · fetched ${relTime(snapshot.fetchedAt)} · expires ${fmtDate(snapshot.expiresAt)} (purged after)` : 'No unexpired snapshot. Only place_id is kept permanently.'}>
        {snapshot ? (
          <>
            <KV
              items={[
                ['Display name', (raw.displayName as { text?: string })?.text ?? (raw.displayName as string) ?? '—'],
                ['Types', Array.isArray(raw.types) ? (raw.types as string[]).join(', ') : '—'],
                ['Editorial', (raw.editorialSummary as { text?: string })?.text ?? '—'],
                ['Opening hours', Array.isArray((raw.regularOpeningHours as { weekdayDescriptions?: string[] })?.weekdayDescriptions) ? (raw.regularOpeningHours as { weekdayDescriptions: string[] }).weekdayDescriptions.join(' · ') : '—'],
              ]}
            />
            <JsonView value={snapshot.raw} collapsed className="mt-2" />
          </>
        ) : null}
        {lead.websiteProbe && (
          <div className="mt-3">
            <div className="text-xs font-medium text-muted-fg">Website probe</div>
            <JsonView value={lead.websiteProbe} collapsed />
          </div>
        )}
      </Section>
    </div>
  );
}

function Contacts({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const [email, setEmail] = React.useState('');
  const [source, setSource] = React.useState('operator');
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [emailType, setEmailType] = React.useState<'named' | 'role_generic'>('named');
  const add = useMutation({
    mutationFn: () => api.leads.addContact(d.lead.id, { email: email.trim(), source: source.trim(), sourceUrl: sourceUrl.trim() || undefined, emailType }),
    onSuccess: () => {
      toast.success('Contact added', 'A verification job was enqueued. It cannot be sent to until verified.');
      setEmail('');
      refresh();
    },
  });
  const primary = useMutation({ mutationFn: (cid: string) => api.leads.setPrimaryContact(d.lead.id, cid), onSuccess: () => { toast.success('Primary contact set'); refresh(); } });
  return (
    <div className="space-y-4">
      {d.contacts.length === 0 ? (
        <EmptyState title="No contacts" description="Run Enrich, or add one manually with its source (the GDPR Art.14 notice names it)." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Email</TH>
              <TH>Type</TH>
              <TH>Verification</TH>
              <TH>Source</TH>
              <TH>Confidence</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {d.contacts.map((c) => (
              <TR key={c.id}>
                <TD>
                  {c.email} {c.isPrimary && <Badge variant="primary">primary</Badge>}
                </TD>
                <TD>{c.emailType}</TD>
                <TD>
                  <StatusBadge status={c.verification} />
                  {c.verifiedAt && <span className="ml-1 text-xs text-muted-fg">{relTime(c.verifiedAt)}{c.verifier ? ` via ${c.verifier}` : ''}</span>}
                </TD>
                <TD>
                  {c.source}
                  {c.sourceUrl && (
                    <a className="ml-1 text-primary hover:underline" href={c.sourceUrl} target="_blank" rel="noreferrer noopener">
                      link
                    </a>
                  )}
                </TD>
                <TD className="tabular-nums">{(c.confidence * 100).toFixed(0)}%</TD>
                <TD>
                  {!c.isPrimary && (
                    <Button size="sm" variant="outline" loading={primary.isPending && primary.variables === c.id} onClick={() => primary.mutate(c.id)}>
                      Set primary
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Note>Sending requires a <strong>valid</strong> verification state on the primary contact and a disclosable source. Role-generic addresses (info@) score 0.75 contactability.</Note>
      <form
        className="grid gap-2 sm:grid-cols-5 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label="Email" htmlFor="ct-email" className="sm:col-span-2">
          <Input id="ct-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Source" htmlFor="ct-source">
          <Input id="ct-source" required value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        <Field label="Source URL" htmlFor="ct-url">
          <Input id="ct-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </Field>
        <Field label="Type" htmlFor="ct-type">
          <div className="flex gap-1">
            <Select id="ct-type" value={emailType} onChange={(e) => setEmailType(e.target.value as 'named' | 'role_generic')}>
              <option value="named">named</option>
              <option value="role_generic">role_generic</option>
            </Select>
            <Button type="submit" loading={add.isPending}>
              Add
            </Button>
          </div>
        </Field>
      </form>
    </div>
  );
}

function SiteQuote({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const [tier, setTier] = React.useState<TierName | ''>('');
  const createQuote = useMutation({ mutationFn: () => api.leads.createQuote(d.lead.id, tier ? { tier } : {}), onSuccess: () => { toast.success('Quote created'); refresh(); } });
  const site = d.site;
  return (
    <div className="space-y-4">
      <Section
        title="Generated preview"
        description={site ? `${site.templateId} · scheme ${site.colourScheme} · type ${site.typography} · ${site.views} views · expires ${fmtDate(site.expiresAt)}${site.takenDownAt ? ` · TAKEN DOWN ${fmtDate(site.takenDownAt)}` : ''}` : 'No site generated yet.'}
        actions={site && <Link className="text-xs text-primary hover:underline" to={`/generator?leadId=${d.lead.id}`}>Edit copy & rebuild</Link>}
      >
        {site?.previewUrl ? (
          <iframe title="Generated site preview" src={site.previewUrl} className="h-[480px] w-full rounded-md border bg-white" sandbox="allow-same-origin allow-scripts" loading="lazy" />
        ) : site ? (
          <Note tone="warning">Built but not published (no previewUrl). Use “Publish preview” under Notes &amp; actions.</Note>
        ) : (
          <EmptyState title="Nothing to preview" description="Run Generate site after profiling." />
        )}
        {site?.copyViolations ? (
          <Note tone="critical" className="mt-2">
            Copy violations recorded: <JsonView value={site.copyViolations} collapsed />
          </Note>
        ) : null}
      </Section>
      <Section title="Quote" actions={d.lead.quoteUrl && <a className="text-xs text-primary hover:underline" href={d.lead.quoteUrl} target="_blank" rel="noreferrer noopener">Open proposal page</a>}>
        {d.quote ? (
          <KV
            items={[
              ['Tier', <Badge key="t" variant="primary">{d.quote.tier}</Badge>],
              ['Build fee', fmtMoney(Number(d.quote.buildFee), d.quote.currency)],
              ['Monthly', fmtMoney(Number(d.quote.monthlyFee), d.quote.currency)],
              ['Line items', <ul key="li" className="text-xs">{(d.quote.lineItems ?? []).map((l, i) => <li key={i}>{l.label}: {fmtMoney(l.oneOff, d.quote!.currency)} one-off + {fmtMoney(l.monthly, d.quote!.currency)}/mo</li>)}</ul>],
              ['Valid until', fmtDate(d.quote.validUntil)],
              ['Accepted', d.quote.acceptedAt ? fmtDate(d.quote.acceptedAt) : 'not yet'],
            ]}
          />
        ) : (
          <div className="text-sm text-muted-fg">No quote yet.</div>
        )}
        <div className="mt-3 flex items-end gap-2">
          <Field label="Tier (blank = engine picks)" htmlFor="qt-tier">
            <Select id="qt-tier" value={tier} onChange={(e) => setTier(e.target.value as TierName | '')}>
              <option value="">auto</option>
              <option value="starter">starter</option>
              <option value="business">business</option>
              <option value="premium">premium</option>
            </Select>
          </Field>
          <Button variant="outline" loading={createQuote.isPending} onClick={() => createQuote.mutate()}>
            {d.quote ? 'Re-quote' : 'Create quote'}
          </Button>
        </div>
        <div className="mt-4">
          <QuotePreviewTool initialLeadId={d.lead.id} compact />
        </div>
      </Section>
    </div>
  );
}

function Outreach({ d }: { d: LeadDetail }) {
  return (
    <div className="space-y-4">
      <Section title={`Messages (${d.messages.length}/4 max touches)`}>
        {d.messages.length === 0 ? (
          <div className="text-sm text-muted-fg">No messages.</div>
        ) : (
          <ul className="divide-y">
            {d.messages.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>step {m.sequenceStep}</Badge>
                  <StatusBadge status={m.status} />
                  <span className="font-medium">{m.subject}</span>
                  <span className="ml-auto text-xs text-muted-fg">{m.sentAt ? `sent ${fmtDate(m.sentAt)}` : m.scheduledFor ? `scheduled ${fmtDate(m.scheduledFor)}` : fmtDate(m.createdAt)}</span>
                </div>
                {m.error && <div className="text-xs text-critical">{m.error}</div>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-primary">Body</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs">{m.bodyText}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Replies (${d.replies.length})`}>
        {d.replies.length === 0 ? (
          <div className="text-sm text-muted-fg">No replies.</div>
        ) : (
          <ul className="divide-y">
            {d.replies.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.intent === 'interested' ? 'success' : r.intent === 'hostile' || r.intent === 'unsubscribe' ? 'critical' : 'default'}>{r.intent}</Badge>
                  <span className="text-xs text-muted-fg">{(r.confidence * 100).toFixed(0)}% · {r.classifiedBy ?? '?'}</span>
                  <span>{r.fromEmail}</span>
                  <span className="ml-auto text-xs text-muted-fg">{fmtDate(r.receivedAt)}</span>
                  {!r.handled && <Link to="/inbox" className="text-xs text-primary hover:underline">handle in inbox</Link>}
                </div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs">{r.raw}</pre>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Timeline({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const [title, setTitle] = React.useState('');
  const [dueAt, setDueAt] = React.useState('');
  const addTask = useMutation({ mutationFn: () => api.leads.addTask(d.lead.id, { title: title.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : undefined }), onSuccess: () => { setTitle(''); setDueAt(''); refresh(); } });
  const done = useMutation({ mutationFn: (tid: string) => api.tasks.done(tid), onSuccess: refresh });
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Section title="Event timeline">
        {d.events.length === 0 ? (
          <div className="text-sm text-muted-fg">No events.</div>
        ) : (
          <ol className="relative ml-2 border-l pl-4 text-sm">
            {d.events.map((e) => (
              <li key={e.id} className="relative pb-3">
                <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" aria-hidden />
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{e.type}</span>
                  <span className="text-xs text-muted-fg">{fmtDate(e.createdAt)}</span>
                </div>
                {e.payload && Object.keys(e.payload).length > 0 && <JsonView value={e.payload} collapsed />}
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section title="Tasks">
        <ul className="space-y-1 text-sm">
          {d.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <Checkbox aria-label={`Mark ${t.title} done`} checked={!!t.doneAt} disabled={!!t.doneAt} onChange={() => done.mutate(t.id)} />
              <span className={t.doneAt ? 'line-through text-muted-fg' : ''}>{t.title}</span>
              {t.dueAt && <span className="ml-auto text-xs text-muted-fg">due {fmtDate(t.dueAt)}</span>}
            </li>
          ))}
          {d.tasks.length === 0 && <li className="text-muted-fg">No tasks.</li>}
        </ul>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) addTask.mutate();
          }}
        >
          <Field label="New task" htmlFor="task-title">
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call back on Tuesday" />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Due" htmlFor="task-due" className="flex-1">
              <Input id="task-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
            <Button type="submit" variant="outline" loading={addTask.isPending}>
              Add
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}

function ReviewTab({ d }: { d: LeadDetail }) {
  if (d.reviewItems.length === 0) return <EmptyState title="No review items" description="Low-confidence classifications, gate blocks, copy violations and reply drafts show here." />;
  return (
    <ul className="space-y-2">
      {d.reviewItems.map((r) => (
        <li key={r.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{titleCase(r.type)}</Badge>
            <StatusBadge status={r.status} />
            <span className="text-xs text-muted-fg">{fmtDate(r.createdAt)}</span>
            {r.status === 'open' && <Link className="ml-auto text-xs text-primary hover:underline" to={`/review?type=${r.type}`}>Open in review queue</Link>}
          </div>
          <JsonView value={r.payload} collapsed className="mt-1" />
          {r.resolution ? <div className="mt-1 text-xs text-muted-fg">Resolved by {r.resolvedBy ?? '?'} {fmtDate(r.resolvedAt)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function GateTab({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const [reason, setReason] = React.useState('');
  const [justification, setJustification] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const evaluate = useMutation({ mutationFn: () => api.compliance.evaluateGate(d.lead.id), onSuccess: (r) => { toast.info(`Gate: ${r.result}`, r.reason ?? undefined); refresh(); } });
  const override = useMutation({
    mutationFn: () => api.compliance.overrideGate(d.lead.id, { reason: reason.trim(), justification: justification.trim() }),
    onSuccess: (r) => {
      toast.success(`Override recorded — gate now ${r.result}`);
      setConfirm(false);
      setReason('');
      setJustification('');
      refresh();
    },
  });
  const ok = reason.trim().length > 0 && justification.trim().length >= 20;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Current gate state" description="Evaluated after enrichment, before generation, and again immediately before every send.">
        <KV
          items={[
            ['State', <GateBadge key="g" gate={d.lead.legalGate} />],
            ['Reason', d.lead.legalGateReason ?? '—'],
            ['Override', d.lead.gateOverride ? <div key="o" className="text-xs">by {d.lead.gateOverride.by ?? '?'} {fmtDate(d.lead.gateOverride.at)}<br />{d.lead.gateOverride.justification}</div> : 'none'],
          ]}
        />
        <div className="mt-3 text-xs text-muted-fg">
          Gate order: no policy for country → prior-consent jurisdiction → suppressed → no contact → unverified → undisclosable source → looks like a sole trader (individual subscriber). Fail closed.
        </div>
        <Button className="mt-3" variant="outline" loading={evaluate.isPending} onClick={() => evaluate.mutate()}>
          Re-evaluate now
        </Button>
      </Section>
      <Section title="Override (logged to the audit trail)" description="Only for the sole-trader heuristic and similar judgement calls. Suppression and prior-consent jurisdictions cannot be overridden.">
        <div className="space-y-2">
          <Field label="Reason" htmlFor="ov-reason">
            <Input id="ov-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. company registry shows Ltd" />
          </Field>
          <Field label="Justification (≥ 20 characters)" htmlFor="ov-just" hint={`${justification.trim().length}/20`}>
            <Textarea id="ov-just" value={justification} onChange={(e) => setJustification(e.target.value)} />
          </Field>
          <Button disabled={!ok} onClick={() => setConfirm(true)}>
            Override gate…
          </Button>
        </div>
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => override.mutateAsync()}
          title="Override the legal gate"
          confirmLabel="Record override"
          acknowledge="I take responsibility for this decision; it is written to the audit log with my justification."
          blastRadius={<>This one lead ({d.lead.businessName}) becomes eligible for generation and outreach (up to 4 messages). Nothing is sent until outreach is enqueued and approved.</>}
        />
      </Section>
    </div>
  );
}

function ActionsTab({ lead, refresh, messageCount }: { lead: LeadDetail['lead']; refresh: () => void; messageCount: number }) {
  const [notes, setNotes] = React.useState(lead.notes ?? '');
  const [priority, setPriority] = React.useState(String(lead.priority));
  const [fallback, setFallback] = React.useState(lead.fallbackChannel);
  const [suppressNote, setSuppressNote] = React.useState('');
  const [confirm, setConfirm] = React.useState<(typeof MANUAL_ACTIONS)[number] | null>(null);
  const save = useMutation({ mutationFn: () => api.leads.update(lead.id, { notes, priority: parseInt(priority, 10) || 0, fallbackChannel: fallback }), onSuccess: () => { toast.success('Saved'); refresh(); } });
  const act = useMutation({
    mutationFn: ({ action, payload }: { action: LeadAction; payload?: Record<string, unknown> }) => api.leads.action(lead.id, action, payload),
    onSuccess: (r, v) => {
      toast.success(`${titleCase(v.action)} ${r.enqueued ? 'enqueued' : 'done'}`);
      setConfirm(null);
      refresh();
    },
  });
  const blast: Record<'send' | 'suppress' | 'publish', React.ReactNode> = {
    send: <>Enqueues the outreach sequence for <strong>{lead.businessName}</strong> ({messageCount} message(s) so far, 4 max ever). Re-gated at dispatch; first-20 sends and flagged messages wait in the approval queue.</>,
    suppress: <><strong>Permanent.</strong> Place id and all contact emails for {lead.businessName} are added to the append-only suppression list; queued messages are cancelled. The UI cannot undo this.</>,
    publish: <>Publishes the generated mockup for {lead.businessName} at a public, noindex preview URL with the mockup banner and takedown link. The business can see it if they get the link.</>,
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Notes & settings">
        <div className="space-y-2">
          <Field label="Notes (never purged with the snapshot)" htmlFor="ln-notes">
            <Textarea id="ln-notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Priority" htmlFor="ln-prio">
              <Input id="ln-prio" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </Field>
            <Field label="Fallback channel" htmlFor="ln-fb" hint="Used when email is blocked (prior-consent jurisdictions).">
              <Select id="ln-fb" value={fallback} onChange={(e) => setFallback(e.target.value as typeof fallback)}>
                <option value="email">email</option>
                <option value="phone_outreach">phone_outreach</option>
                <option value="postal_outreach">postal_outreach</option>
              </Select>
            </Field>
          </div>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </Section>
      <Section title="Manual actions" description="Each enqueues the corresponding pipeline job for this lead only.">
        <div className="flex flex-wrap gap-2">
          {MANUAL_ACTIONS.map((a) => (
            <Button key={a.action} size="sm" variant={a.destructive ? 'destructive' : 'outline'} loading={act.isPending && act.variables?.action === a.action} onClick={() => (a.confirm ? setConfirm(a) : act.mutate({ action: a.action }))}>
              {a.label}
            </Button>
          ))}
        </div>
        <ConfirmDialog
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          onConfirm={() => confirm && act.mutateAsync({ action: confirm.action, payload: confirm.action === 'suppress' ? { reason: 'operator', note: suppressNote || undefined } : undefined })}
          title={confirm?.label ?? ''}
          confirmLabel={confirm?.label}
          destructive={confirm?.destructive}
          typeToConfirm={confirm?.confirm === 'suppress' ? 'SUPPRESS' : undefined}
          blastRadius={confirm ? blast[confirm.confirm!] : null}
        >
          {confirm?.confirm === 'suppress' && (
            <Field label="Note (logged)" htmlFor="sup-note">
              <Textarea id="sup-note" value={suppressNote} onChange={(e) => setSuppressNote(e.target.value)} />
            </Field>
          )}
        </ConfirmDialog>
      </Section>
    </div>
  );
}
