import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ExternalLink, SlidersHorizontal, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtDate, fmtMoney, relTime, titleCase } from '@/lib/utils';
import { Dialog, Tabs, TabsList, TabsTrigger, TabsContent, KV, JsonView, StageLabel, GateLabel, StatusLabel, DotLabel, Button, Input, Select, Textarea, Field, ConfirmDialog, Note, EmptyState, Loading, ErrorState, SubSection, Divider, Table, THead, TBody, TR, TH, TD, Checkbox, CellSub } from '@/components/ui';
import { ScoreBreakdownView } from '@/components/ScoreBreakdown';
import type { LeadDetail, LeadAction, TierName } from '@/lib/types';
import { QuotePreviewTool } from '@/pages/Pricing';
import { StylesTab } from './StylesTab';

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
  const [tab, setTab] = React.useState('overview');
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.lead(id) });
    void qc.invalidateQueries({ queryKey: keys.leads });
  };
  const d = q.data;
  const lead = d?.lead;
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <Dialog
        open
        onClose={onClose}
        side="right"
        title={lead ? lead.businessName : 'Lead'}
        description={
          lead ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StageLabel stage={lead.stage} />
              <GateLabel gate={lead.legalGate} reason={lead.legalGateReason} />
              <span>
                {[lead.city, lead.countryCode].filter(Boolean).join(', ')}
                {lead.primaryType ? ` · ${lead.primaryType.replace(/_/g, ' ')}` : ''}
              </span>
              <span className="font-mono text-xs">{lead.id}</span>
            </span>
          ) : undefined
        }
        header={
          d ? (
            <TabsList aria-label="Lead sections" className="-mb-px gap-x-5 border-b-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="contacts" badge={d.contacts.length}>Contacts</TabsTrigger>
              <TabsTrigger value="site">Site & quote</TabsTrigger>
              <TabsTrigger value="styles">Styles</TabsTrigger>
              <TabsTrigger value="outreach" badge={d.messages.length + d.replies.length}>Outreach</TabsTrigger>
              <TabsTrigger value="timeline" badge={d.events.length}>Timeline</TabsTrigger>
              <TabsTrigger value="review" badge={d.reviewItems.filter((r) => r.status === 'open').length}>Review</TabsTrigger>
              <TabsTrigger value="gate">Gate</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>
          ) : undefined
        }
      >
        {q.isLoading ? <Loading rows={8} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d ? <LeadBody d={d} refresh={invalidate} /> : null}
      </Dialog>
    </Tabs>
  );
}

function LeadBody({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const { lead } = d;
  return (
    <>
      <TabsContent value="overview" className="mt-0"><Overview d={d} /></TabsContent>
      <TabsContent value="contacts" className="mt-0"><Contacts d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="site" className="mt-0"><SiteQuote d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="styles" className="mt-0"><StylesTab d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="outreach" className="mt-0"><Outreach d={d} /></TabsContent>
      <TabsContent value="timeline" className="mt-0"><Timeline d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="review" className="mt-0"><ReviewTab d={d} /></TabsContent>
      <TabsContent value="gate" className="mt-0"><GateTab d={d} refresh={refresh} /></TabsContent>
      <TabsContent value="actions" className="mt-0"><ActionsTab lead={lead} refresh={refresh} messageCount={d.messages.length} /></TabsContent>
    </>
  );
}

function ExtLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a className="inline-flex max-w-full items-center gap-1 text-primary hover:underline" href={href} target="_blank" rel="noreferrer noopener">
      <span className="truncate">{children ?? href}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  );
}

function Overview({ d }: { d: LeadDetail }) {
  const { lead, snapshot } = d;
  const raw = (snapshot?.raw ?? {}) as Record<string, unknown>;
  const addr = (raw.formattedAddress as string) ?? null;
  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <SubSection title="Key facts">
          <KV
            items={[
              ['Score', lead.score == null ? '—' : <span className="tabular-nums">{lead.score.toFixed(2)}</span>],
              ['Stage', <StageLabel key="s" stage={lead.stage} />],
              ['Legal gate', <span key="g" className="inline-flex flex-wrap items-center gap-2"><GateLabel gate={lead.legalGate} /> {lead.legalGateReason && <span className="text-sm text-muted-fg">{lead.legalGateReason}</span>}</span>],
              ['Website', <span key="w" className="flex flex-col gap-0.5"><span>{lead.websiteStatus.replace(/_/g, ' ')}</span>{lead.websiteUrl && <ExtLink href={lead.websiteUrl} />}</span>],
              ['Type / vertical', `${lead.primaryType?.replace(/_/g, ' ') ?? '—'} / ${lead.vertical ?? '—'}`],
              ['Rating', lead.rating == null ? '—' : <span key="r" className="inline-flex items-center gap-1.5"><Star className="size-3.5 text-warn-dot" aria-hidden /> {lead.rating} <span className="text-muted-fg">({lead.reviewCount ?? 0} reviews)</span></span>],
              ['Phone', lead.phone ? <a key="ph" className="text-primary tabular-nums hover:underline" href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}>{lead.phone}</a> : '—'],
              ['Address', addr],
              ['Business status', lead.businessStatus ? titleCase(lead.businessStatus.toLowerCase()) : '—'],
              ['Price level', lead.priceLevel],
              ['Coordinates', lead.lat != null && lead.lng != null ? <span key="co" className="tabular-nums">{lead.lat.toFixed(5)}, {lead.lng.toFixed(5)}</span> : '—'],
              ['Place id', <span key="p" className="font-mono text-xs">{lead.placeId}</span>],
              ['Campaign', <Link key="c" className="font-mono text-xs text-primary hover:underline" to={`/campaigns/${lead.campaignId}`}>{lead.campaignId}</Link>],
              ['Fallback channel', lead.fallbackChannel.replace(/_/g, ' ')],
              ['Priority', lead.priority],
              ['Preview', <span key="pv" className="inline-flex flex-wrap items-center gap-3"><Link className="text-primary hover:underline" to={`/leads/${lead.id}/studio`}>Design studio</Link>{lead.previewUrl ? <ExtLink href={lead.previewUrl} /> : <span className="text-muted-fg">not published</span>}</span>],
              ['Quote', lead.quoteUrl ? <ExtLink key="qu" href={lead.quoteUrl} /> : '—'],
              ['Created', fmtDate(lead.createdAt)],
              ['Last touch', fmtDate(lead.lastTouchAt)],
            ]}
          />
        </SubSection>
        <SubSection title="Score breakdown" description="Why this lead ranks where it does.">
          <ScoreBreakdownView breakdown={lead.scoreBreakdown} score={lead.score} />
        </SubSection>
      </div>
      <Divider />
      <div className="grid gap-8 lg:grid-cols-2">
        <SubSection title="Classification" description="LLM output with confidence; low confidence routes to the review queue.">
          {lead.classification ? (
            <div className="space-y-3">
              <KV
                items={[
                  ['Confidence', <DotLabel key="cf" tone={lead.classification.confidence >= 0.7 ? 'good' : 'warning'}>{(lead.classification.confidence * 100).toFixed(0)}%{lead.classification.insufficientData && <span className="ml-2 text-sm text-bad-fg">insufficient data</span>}</DotLabel>],
                  ['Vertical', `${lead.classification.vertical} / ${lead.classification.subVertical}`],
                  ['Services', lead.classification.servicesOffered.join(', ')],
                  ['Differentiators', lead.classification.differentiators.join(', ') || '—'],
                  ['Tone / CTA', `${lead.classification.toneOfVoice} / ${lead.classification.primaryCTA}`],
                  ['Language', lead.classification.languageCode],
                ]}
              />
              <p className="text-sm text-muted-fg">Inputs: the Places snapshot (name, types, reviews, editorial summary).</p>
            </div>
          ) : (
            <p className="text-sm text-muted-fg">Not profiled yet.</p>
          )}
        </SubSection>
        <SubSection title="Google Places snapshot" description={snapshot ? `${snapshot.kind} · fetched ${relTime(snapshot.fetchedAt)} · purged after ${fmtDate(snapshot.expiresAt)}` : 'No unexpired snapshot. Only place_id is kept permanently.'}>
          {snapshot ? (
            <div className="space-y-3">
              <KV
                items={[
                  ['Display name', (raw.displayName as { text?: string })?.text ?? (raw.displayName as string) ?? '—'],
                  ['Types', Array.isArray(raw.types) ? (raw.types as string[]).map((t) => t.replace(/_/g, ' ')).join(', ') : '—'],
                  ['Editorial', (raw.editorialSummary as { text?: string })?.text ?? '—'],
                  ['Opening hours', Array.isArray((raw.regularOpeningHours as { weekdayDescriptions?: string[] })?.weekdayDescriptions) ? <ul key="oh" className="text-sm">{(raw.regularOpeningHours as { weekdayDescriptions: string[] }).weekdayDescriptions.map((l) => <li key={l}>{l}</li>)}</ul> : '—'],
                ]}
              />
              <JsonView value={snapshot.raw} collapsed label="snapshot JSON" />
            </div>
          ) : null}
          {lead.websiteProbe && (
            <div className="mt-3">
              <JsonView value={lead.websiteProbe} collapsed label="website probe" />
            </div>
          )}
        </SubSection>
      </div>
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
  const tel = d.lead.phone ? `tel:${d.lead.phone.replace(/[^+\d]/g, '')}` : null;
  return (
    <div className="space-y-8">
      <SubSection title="Email contacts" description="Sending requires a valid verification state on the primary contact and a disclosable source. Role-generic addresses (info@) score 0.75 contactability.">
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
                <TH numeric>Confidence</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {d.contacts.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <a className="hover:underline" href={`mailto:${c.email}`}>
                      {c.email}
                    </a>
                    {c.isPrimary && <span className="ml-2 text-sm text-muted-fg">primary</span>}
                  </TD>
                  <TD className="text-muted-fg">{c.emailType.replace(/_/g, ' ')}</TD>
                  <TD>
                    <StatusLabel status={c.verification} />
                    {c.verifiedAt && <CellSub>{relTime(c.verifiedAt)}{c.verifier ? ` via ${c.verifier}` : ''}</CellSub>}
                  </TD>
                  <TD>
                    {c.source}
                    {c.sourceUrl && (
                      <a className="ml-2 text-sm text-primary hover:underline" href={c.sourceUrl} target="_blank" rel="noreferrer noopener">
                        link
                      </a>
                    )}
                  </TD>
                  <TD numeric>{(c.confidence * 100).toFixed(0)}%</TD>
                  <TD className="text-right">
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
      </SubSection>
      <Divider />
      <SubSection title="Phone" description="From the Google listing.">
        {tel ? (
          <a className="text-primary tabular-nums hover:underline" href={tel}>
            {d.lead.phone}
          </a>
        ) : (
          <span className="text-muted-fg">None on the listing.</span>
        )}
      </SubSection>
      <Divider />
      <SubSection title="Add a contact">
        <form
          className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Email" htmlFor="ct-email">
            <Input id="ct-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Source" htmlFor="ct-source">
            <Input id="ct-source" required value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
          <Field label="Source URL" htmlFor="ct-url">
            <Input id="ct-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="ct-type">
            <Select id="ct-type" value={emailType} onChange={(e) => setEmailType(e.target.value as 'named' | 'role_generic')}>
              <option value="named">named</option>
              <option value="role_generic">role generic</option>
            </Select>
          </Field>
          <Button type="submit" variant="outline" loading={add.isPending}>
            Add
          </Button>
        </form>
      </SubSection>
    </div>
  );
}

function SiteQuote({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const [tier, setTier] = React.useState<TierName | ''>('');
  const createQuote = useMutation({ mutationFn: () => api.leads.createQuote(d.lead.id, tier ? { tier } : {}), onSuccess: () => { toast.success('Quote created'); refresh(); } });
  const site = d.site;
  return (
    <div className="space-y-8">
      <SubSection
        title="Generated preview"
        description={site ? `${site.templateId} · scheme ${site.colourScheme} · type ${site.typography} · ${site.views} views · expires ${fmtDate(site.expiresAt)}${site.takenDownAt ? ` · taken down ${fmtDate(site.takenDownAt)}` : ''}` : 'No site generated yet.'}
        actions={
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="inline-flex items-center gap-1 font-medium text-primary hover:underline" to={`/leads/${d.lead.id}/studio`}>
              <SlidersHorizontal className="size-3.5" aria-hidden /> Open in design studio
            </Link>
            {site && <Link className="text-primary hover:underline" to={`/generator?leadId=${d.lead.id}`}>Edit copy & rebuild</Link>}
          </span>
        }
      >
        {site?.previewUrl ? (
          <iframe title="Generated site preview" src={site.previewUrl} className="h-[480px] w-full rounded-lg border bg-white" sandbox="allow-same-origin allow-scripts" loading="lazy" />
        ) : site ? (
          <Note tone="warning">Built but not published (no preview URL). Use “Publish preview” under Actions.</Note>
        ) : (
          <EmptyState title="Nothing to preview" description="Run Generate site after profiling." />
        )}
        {site?.copyViolations ? (
          <Note tone="critical" className="mt-3">
            <div>Copy violations recorded on the last build.</div>
            <JsonView value={site.copyViolations} collapsed label="violations" />
          </Note>
        ) : null}
      </SubSection>
      <Divider />
      <SubSection title="Quote" actions={d.lead.quoteUrl && <a className="text-sm text-primary hover:underline" href={d.lead.quoteUrl} target="_blank" rel="noreferrer noopener">Open proposal page</a>}>
        {d.quote ? (
          <KV
            items={[
              ['Tier', titleCase(d.quote.tier)],
              ['Build fee', fmtMoney(Number(d.quote.buildFee), d.quote.currency)],
              ['Monthly', fmtMoney(Number(d.quote.monthlyFee), d.quote.currency)],
              ['Line items', <ul key="li" className="text-sm">{(d.quote.lineItems ?? []).map((l, i) => <li key={i}>{l.label}: {fmtMoney(l.oneOff, d.quote!.currency)} one-off + {fmtMoney(l.monthly, d.quote!.currency)}/mo</li>)}</ul>],
              ['Valid until', fmtDate(d.quote.validUntil)],
              ['Accepted', d.quote.acceptedAt ? fmtDate(d.quote.acceptedAt) : 'not yet'],
            ]}
          />
        ) : (
          <p className="text-sm text-muted-fg">No quote yet.</p>
        )}
        <div className="mt-4 flex items-end gap-2">
          <Field label="Tier" htmlFor="qt-tier" hint="Blank lets the engine pick.">
            <Select id="qt-tier" className="w-40" value={tier} onChange={(e) => setTier(e.target.value as TierName | '')}>
              <option value="">auto</option>
              <option value="starter">starter</option>
              <option value="business">business</option>
              <option value="premium">premium</option>
            </Select>
          </Field>
          <Button variant="outline" className="mb-6" loading={createQuote.isPending} onClick={() => createQuote.mutate()}>
            {d.quote ? 'Re-quote' : 'Create quote'}
          </Button>
        </div>
      </SubSection>
      <Divider />
      <SubSection title="Quote preview" description="Computed server-side with the saved pricing config.">
        <QuotePreviewTool initialLeadId={d.lead.id} compact />
      </SubSection>
    </div>
  );
}

function Outreach({ d }: { d: LeadDetail }) {
  return (
    <div className="space-y-8">
      <SubSection title="Messages" description={`${d.messages.length} of 4 max touches used.`}>
        {d.messages.length === 0 ? (
          <p className="text-sm text-muted-fg">No messages.</p>
        ) : (
          <ul className="divide-y">
            {d.messages.map((m) => (
              <li key={m.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm text-muted-fg tabular-nums">Step {m.sequenceStep}</span>
                  <StatusLabel status={m.status} className="text-sm" />
                  <span className="font-medium">{m.subject}</span>
                  <span className="ml-auto text-sm text-muted-fg">{m.sentAt ? `sent ${fmtDate(m.sentAt)}` : m.scheduledFor ? `scheduled ${fmtDate(m.scheduledFor)}` : fmtDate(m.createdAt)}</span>
                </div>
                {m.error && <div className="mt-1 text-sm text-bad-fg">{m.error}</div>}
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-sm text-primary">Show body</summary>
                  <pre className="mt-2 rounded-md border bg-muted/40 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{m.bodyText}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SubSection>
      <Divider />
      <SubSection title="Replies" description={`${d.replies.length} received.`}>
        {d.replies.length === 0 ? (
          <p className="text-sm text-muted-fg">No replies.</p>
        ) : (
          <ul className="divide-y">
            {d.replies.map((r) => (
              <li key={r.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusLabel status={r.intent} />
                  <span className="text-sm text-muted-fg">{(r.confidence * 100).toFixed(0)}% · {r.classifiedBy ?? '?'}</span>
                  <span>{r.fromEmail}</span>
                  <span className="ml-auto text-sm text-muted-fg">{fmtDate(r.receivedAt)}</span>
                  {!r.handled && <Link to="/inbox" className="text-sm text-primary hover:underline">Handle in inbox</Link>}
                </div>
                <pre className="mt-2 max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{r.raw}</pre>
              </li>
            ))}
          </ul>
        )}
      </SubSection>
    </div>
  );
}

function Timeline({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const [title, setTitle] = React.useState('');
  const [dueAt, setDueAt] = React.useState('');
  const addTask = useMutation({ mutationFn: () => api.leads.addTask(d.lead.id, { title: title.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : undefined }), onSuccess: () => { setTitle(''); setDueAt(''); refresh(); } });
  const done = useMutation({ mutationFn: (tid: string) => api.tasks.done(tid), onSuccess: refresh });
  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      <SubSection title="Events">
        {d.events.length === 0 ? (
          <p className="text-sm text-muted-fg">No events.</p>
        ) : (
          <ol className="relative ml-1 border-l pl-5">
            {d.events.map((e) => (
              <li key={e.id} className="relative pb-4 last:pb-0">
                <span className="absolute top-2 -left-[25px] size-2 rounded-full border-2 border-card bg-neutral-dot" aria-hidden />
                <div className="flex items-baseline gap-3">
                  <span className="font-medium">{e.type.replace(/[._]/g, ' ')}</span>
                  <span className="text-sm text-muted-fg">{fmtDate(e.createdAt)}</span>
                </div>
                {e.payload && Object.keys(e.payload).length > 0 && <JsonView value={e.payload} collapsed label="payload" />}
              </li>
            ))}
          </ol>
        )}
      </SubSection>
      <SubSection title="Tasks">
        <ul className="space-y-2">
          {d.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5">
              <Checkbox aria-label={`Mark ${t.title} done`} checked={!!t.doneAt} disabled={!!t.doneAt} onChange={() => done.mutate(t.id)} />
              <span className={t.doneAt ? 'text-muted-fg line-through' : ''}>{t.title}</span>
              {t.dueAt && <span className="ml-auto text-sm text-muted-fg">due {fmtDate(t.dueAt)}</span>}
            </li>
          ))}
          {d.tasks.length === 0 && <li className="text-sm text-muted-fg">No tasks.</li>}
        </ul>
        <form
          className="mt-4 flex flex-col gap-3 border-t pt-4"
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
      </SubSection>
    </div>
  );
}

function ReviewTab({ d }: { d: LeadDetail }) {
  if (d.reviewItems.length === 0) return <EmptyState title="No review items" description="Low-confidence classifications, gate blocks, copy violations and reply drafts show here." />;
  return (
    <ul className="divide-y">
      {d.reviewItems.map((r) => (
        <li key={r.id} className="py-4 first:pt-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{titleCase(r.type)}</span>
            <StatusLabel status={r.status} className="text-sm" />
            <span className="text-sm text-muted-fg">{fmtDate(r.createdAt)}</span>
            {r.status === 'open' && <Link className="ml-auto text-sm text-primary hover:underline" to={`/review?type=${r.type}`}>Open in review queue</Link>}
          </div>
          <JsonView value={r.payload} collapsed className="mt-1.5" label="payload" />
          {r.resolution ? <div className="mt-1.5 text-sm text-muted-fg">Resolved by {r.resolvedBy ?? '?'} {fmtDate(r.resolvedAt)}</div> : null}
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
    <div className="grid gap-8 lg:grid-cols-2">
      <SubSection title="Current gate state" description="Evaluated after enrichment, before generation, and again immediately before every send.">
        <KV
          items={[
            ['State', <GateLabel key="g" gate={d.lead.legalGate} />],
            ['Reason', d.lead.legalGateReason ?? '—'],
            ['Override', d.lead.gateOverride ? <div key="o" className="text-sm">by {d.lead.gateOverride.by ?? '?'} {fmtDate(d.lead.gateOverride.at)}<br />{d.lead.gateOverride.justification}</div> : 'none'],
          ]}
        />
        <p className="mt-4 text-sm text-muted-fg">Gate order: no policy for country → prior-consent jurisdiction → suppressed → no contact → unverified → undisclosable source → looks like a sole trader. Fails closed.</p>
        <Button className="mt-4" variant="outline" loading={evaluate.isPending} onClick={() => evaluate.mutate()}>
          Re-evaluate now
        </Button>
      </SubSection>
      <SubSection title="Override" description="Logged to the audit trail. Only for the sole-trader heuristic and similar judgement calls; suppression and prior-consent jurisdictions cannot be overridden.">
        <div className="space-y-3">
          <Field label="Reason" htmlFor="ov-reason">
            <Input id="ov-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. company registry shows Ltd" />
          </Field>
          <Field label="Justification" htmlFor="ov-just" hint={`At least 20 characters · ${justification.trim().length}/20`}>
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
      </SubSection>
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
    <div className="grid gap-8 lg:grid-cols-2">
      <SubSection title="Notes & settings">
        <div className="space-y-3">
          <Field label="Notes" htmlFor="ln-notes" hint="Never purged with the snapshot.">
            <Textarea id="ln-notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" htmlFor="ln-prio">
              <Input id="ln-prio" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </Field>
            <Field label="Fallback channel" htmlFor="ln-fb" hint="Used when email is blocked.">
              <Select id="ln-fb" value={fallback} onChange={(e) => setFallback(e.target.value as typeof fallback)}>
                <option value="email">email</option>
                <option value="phone_outreach">phone outreach</option>
                <option value="postal_outreach">postal outreach</option>
              </Select>
            </Field>
          </div>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </SubSection>
      <SubSection title="Manual actions" description="Each enqueues the corresponding pipeline job for this lead only.">
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
      </SubSection>
    </div>
  );
}
