import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { COLOUR_SCHEMES, TYPOGRAPHY_PAIRINGS, SiteCopySchema } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtDate, relTime } from '@/lib/utils';
import { PageHeader, QueryState, Section, Card, Badge, Button, Field, Input, Select, Textarea, Loading, EmptyState, ErrorState, Note, Table, THead, TBody, TR, TH, TD } from '@/components/ui';
import type { SiteCopy, TemplateInfo } from '@/lib/types';

export function GeneratorPage() {
  const [sp, setSp] = useSearchParams();
  const leadId = sp.get('leadId') ?? '';
  const [selected, setSelected] = React.useState<string | null>(null);
  const [scheme, setScheme] = React.useState<string>('a');
  const [typo, setTypo] = React.useState<string>('a');
  const templates = useQuery({ queryKey: [...keys.generator, 'templates'], queryFn: api.generator.templates, staleTime: 5 * 60_000 });
  const builds = useQuery({ queryKey: [...keys.generator, 'builds'], queryFn: () => api.generator.builds(20), refetchInterval: 30_000 });
  const sample = useQuery({
    queryKey: [...keys.generator, 'sample', selected, scheme, typo],
    queryFn: () => api.generator.sample(selected!, { colourScheme: scheme, typography: typo }),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  });
  const chosen = templates.data?.find((t) => t.id === selected);

  return (
    <>
      <PageHeader title="Generator" description="Template library, sample previews, recent builds, and the copy editor for a specific lead's site." />
      <div className="space-y-4">
        <Section title="Template library" description="Six families (spec §9.2). Each supports three colour schemes and two typography pairings.">
          <QueryState query={templates}>
            {(list) => (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <TemplateCard key={t.id} t={t} active={selected === t.id} onSelect={() => setSelected(t.id)} />
                ))}
              </div>
            )}
          </QueryState>
          {selected && chosen && (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Colour scheme" htmlFor="g-scheme">
                  <Select id="g-scheme" value={scheme} onChange={(e) => setScheme(e.target.value)}>
                    {(chosen.colourSchemes?.length ? chosen.colourSchemes : COLOUR_SCHEMES).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Typography" htmlFor="g-typo">
                  <Select id="g-typo" value={typo} onChange={(e) => setTypo(e.target.value)}>
                    {(chosen.typography?.length ? chosen.typography : TYPOGRAPHY_PAIRINGS).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <span className="text-xs text-muted-fg">
                  Sample of <strong>{chosen.id}</strong> with fixture data.
                </span>
              </div>
              {sample.isLoading ? <Loading label="Rendering sample…" /> : sample.isError ? <ErrorState error={sample.error} onRetry={() => sample.refetch()} /> : sample.data ? <iframe title={`${chosen.id} sample`} srcDoc={sample.data} sandbox="allow-same-origin" className="h-[560px] w-full rounded-md border bg-white" /> : null}
            </div>
          )}
        </Section>

        <Section title="Recent builds" description="Latest generated sites across all campaigns.">
          <QueryState query={builds} empty={<EmptyState title="No builds yet" description="Sites are built after profiling; trigger “Generate site” from a lead." />}>
            {(rows) => (
              <Table>
                <THead>
                  <tr>
                    <TH>Lead</TH>
                    <TH>Template</TH>
                    <TH>Preview</TH>
                    <TH>Views</TH>
                    <TH>Built</TH>
                    <TH>Expires</TH>
                    <TH />
                  </tr>
                </THead>
                <TBody>
                  {rows.map((b) => (
                    <TR key={b.id}>
                      <TD>
                        <Link className="font-medium hover:underline" to={`/leads/${b.leadId}`}>
                          {b.lead?.businessName ?? b.leadId}
                        </Link>
                      </TD>
                      <TD>
                        {b.templateId} <span className="text-xs text-muted-fg">{b.colourScheme}/{b.typography}</span>
                      </TD>
                      <TD>
                        {b.previewUrl ? (
                          <a className="text-primary hover:underline" href={b.previewUrl} target="_blank" rel="noreferrer noopener">
                            open
                          </a>
                        ) : (
                          <Badge variant="warning">unpublished</Badge>
                        )}
                        {b.takenDownAt && <Badge variant="critical">taken down</Badge>}
                      </TD>
                      <TD className="tabular-nums">{b.views}</TD>
                      <TD className="text-xs text-muted-fg">{relTime(b.updatedAt)}</TD>
                      <TD className="text-xs text-muted-fg">{fmtDate(b.expiresAt)}</TD>
                      <TD>
                        <Button size="sm" variant="outline" onClick={() => setSp({ leadId: b.leadId })}>
                          Edit copy
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Section>

        <Section
          title="Copy editor"
          description="Edit every SiteCopy field for a lead's generated site, save (enqueues a rebuild) or rebuild with a different template/scheme."
          actions={
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = (new FormData(e.currentTarget).get('leadId') as string).trim();
                setSp(v ? { leadId: v } : {});
              }}
            >
              <Field label="Lead id" htmlFor="g-lead">
                <Input id="g-lead" name="leadId" defaultValue={leadId} className="w-64 font-mono text-xs" placeholder="paste a lead id" />
              </Field>
              <Button type="submit" variant="outline">
                Load
              </Button>
            </form>
          }
        >
          {leadId ? <CopyEditor leadId={leadId} templates={templates.data ?? []} /> : <EmptyState title="No lead selected" description="Pick a build above or paste a lead id." />}
        </Section>
      </div>
    </>
  );
}

function TemplateCard({ t, active, onSelect }: { t: TemplateInfo; active: boolean; onSelect: () => void }) {
  return (
    <Card className={cn('p-3 transition-colors', active && 'border-primary')}>
      <div className="flex items-center justify-between">
        <div className="font-medium">{t.id}</div>
        <Button size="sm" variant={active ? 'default' : 'outline'} onClick={onSelect} aria-pressed={active}>
          {active ? 'Previewing' : 'Preview'}
        </Button>
      </div>
      <div className="mt-1 text-xs text-muted-fg">Verticals: {t.verticals.join(', ')}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.sections.map((s) => (
          <Badge key={s} variant="outline">
            {s}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

const EMPTY_COPY: SiteCopy = {
  meta: { title: '', description: '' },
  hero: { headline: '', subhead: '', ctaLabel: '' },
  about: { heading: '', body: '' },
  services: [{ name: '', description: '' }],
  whyUs: [{ title: '', body: '' }],
  cta: { heading: '', body: '', buttonLabel: '' },
  placeholdersUsed: [],
};

export function CopyEditor({ leadId, templates }: { leadId: string; templates: TemplateInfo[] }) {
  const qc = useQueryClient();
  const site = useQuery({ queryKey: [...keys.lead(leadId), 'site'], queryFn: () => api.leads.site(leadId) });
  const [copy, setCopy] = React.useState<SiteCopy | null>(null);
  const [templateId, setTemplateId] = React.useState('');
  const [scheme, setScheme] = React.useState('a');
  const [typo, setTypo] = React.useState('a');
  const [errors, setErrors] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (site.data) {
      setCopy({ ...EMPTY_COPY, ...(site.data.copy ?? {}) });
      setTemplateId(site.data.templateId);
      setScheme(site.data.colourScheme);
      setTypo(site.data.typography);
    }
  }, [site.data]);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.lead(leadId) });
    void qc.invalidateQueries({ queryKey: keys.generator });
  };
  const save = useMutation({ mutationFn: (c: SiteCopy) => api.leads.saveCopy(leadId, c), onSuccess: () => { toast.success('Copy saved', 'A rebuild has been enqueued.'); invalidate(); } });
  const rebuild = useMutation({ mutationFn: () => api.leads.rebuild(leadId, { templateId: templateId || undefined, colourScheme: scheme, typography: typo }), onSuccess: () => { toast.success('Rebuild enqueued'); invalidate(); } });

  if (site.isLoading) return <Loading />;
  if (site.isError) return <ErrorState error={site.error} onRetry={() => site.refetch()} />;
  if (!site.data || !copy) return <EmptyState title="No generated site for this lead" description="Generate it from the lead drawer first." />;

  const onSave = () => {
    const r = SiteCopySchema.safeParse(copy);
    if (!r.success) {
      setErrors(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      return;
    }
    setErrors([]);
    save.mutate(r.data);
  };
  const text = (label: string, value: string, set: (v: string) => void, opts: { rows?: number; max?: number } = {}) => (
    <Field label={label} hint={opts.max ? `${value.length}/${opts.max}` : undefined}>
      {opts.rows ? <Textarea rows={opts.rows} value={value} maxLength={opts.max} onChange={(e) => set(e.target.value)} /> : <Input value={value} maxLength={opts.max} onChange={(e) => set(e.target.value)} />}
    </Field>
  );
  const s = site.data;
  const brief = s.contentBrief as { verifiedFacts?: string[] };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-fg">
          <Link to={`/leads/${leadId}`} className="text-primary hover:underline">
            {s.lead?.businessName ?? leadId}
          </Link>
          · {s.templateId} · build {s.buildHash.slice(0, 8)} · {s.views} views · expires {fmtDate(s.expiresAt)}
          {s.previewUrl && (
            <a className="text-primary hover:underline" href={s.previewUrl} target="_blank" rel="noreferrer noopener">
              open preview
            </a>
          )}
        </div>
        <fieldset className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium">meta</legend>
          {text('title (≤ 70)', copy.meta.title, (v) => setCopy({ ...copy, meta: { ...copy.meta, title: v } }), { max: 70 })}
          {text('description (≤ 170)', copy.meta.description, (v) => setCopy({ ...copy, meta: { ...copy.meta, description: v } }), { max: 170 })}
        </fieldset>
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium">hero</legend>
          {text('headline', copy.hero.headline, (v) => setCopy({ ...copy, hero: { ...copy.hero, headline: v } }))}
          {text('subhead', copy.hero.subhead, (v) => setCopy({ ...copy, hero: { ...copy.hero, subhead: v } }), { rows: 2 })}
          {text('ctaLabel', copy.hero.ctaLabel, (v) => setCopy({ ...copy, hero: { ...copy.hero, ctaLabel: v } }))}
        </fieldset>
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium">about</legend>
          {text('heading', copy.about.heading, (v) => setCopy({ ...copy, about: { ...copy.about, heading: v } }))}
          {text('body', copy.about.body, (v) => setCopy({ ...copy, about: { ...copy.about, body: v } }), { rows: 4 })}
        </fieldset>
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium">services (1–8)</legend>
          {copy.services.map((sv, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              {text(`name ${i + 1}`, sv.name, (v) => setCopy({ ...copy, services: copy.services.map((x, j) => (j === i ? { ...x, name: v } : x)) }))}
              {text('description', sv.description, (v) => setCopy({ ...copy, services: copy.services.map((x, j) => (j === i ? { ...x, description: v } : x)) }))}
              <Button variant="ghost" size="sm" className="self-end" aria-label={`Remove service ${i + 1}`} disabled={copy.services.length <= 1} onClick={() => setCopy({ ...copy, services: copy.services.filter((_, j) => j !== i) })}>
                ×
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={copy.services.length >= 8} onClick={() => setCopy({ ...copy, services: [...copy.services, { name: '', description: '' }] })}>
            Add service
          </Button>
        </fieldset>
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium">whyUs (1–4)</legend>
          {copy.whyUs.map((w, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              {text(`title ${i + 1}`, w.title, (v) => setCopy({ ...copy, whyUs: copy.whyUs.map((x, j) => (j === i ? { ...x, title: v } : x)) }))}
              {text('body', w.body, (v) => setCopy({ ...copy, whyUs: copy.whyUs.map((x, j) => (j === i ? { ...x, body: v } : x)) }))}
              <Button variant="ghost" size="sm" className="self-end" aria-label={`Remove whyUs ${i + 1}`} disabled={copy.whyUs.length <= 1} onClick={() => setCopy({ ...copy, whyUs: copy.whyUs.filter((_, j) => j !== i) })}>
                ×
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={copy.whyUs.length >= 4} onClick={() => setCopy({ ...copy, whyUs: [...copy.whyUs, { title: '', body: '' }] })}>
            Add reason
          </Button>
        </fieldset>
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium">cta</legend>
          {text('heading', copy.cta.heading, (v) => setCopy({ ...copy, cta: { ...copy.cta, heading: v } }))}
          {text('body', copy.cta.body, (v) => setCopy({ ...copy, cta: { ...copy.cta, body: v } }), { rows: 2 })}
          {text('buttonLabel', copy.cta.buttonLabel, (v) => setCopy({ ...copy, cta: { ...copy.cta, buttonLabel: v } }))}
        </fieldset>
        <Field label="placeholdersUsed (comma separated; disclosed in the page footer)">
          <Input value={copy.placeholdersUsed.join(', ')} onChange={(e) => setCopy({ ...copy, placeholdersUsed: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
        </Field>
        {errors.length > 0 && (
          <Note tone="critical">
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Note>
        )}
        <div className="flex gap-2">
          <Button loading={save.isPending} onClick={onSave}>
            Save copy & rebuild
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        <Section title="Rebuild with different styling">
          <div className="space-y-2">
            <Field label="Template">
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id}>{t.id}</option>
                ))}
                {!templates.some((t) => t.id === templateId) && templateId && <option>{templateId}</option>}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Colour scheme">
                <Select value={scheme} onChange={(e) => setScheme(e.target.value)}>
                  {COLOUR_SCHEMES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Typography">
                <Select value={typo} onChange={(e) => setTypo(e.target.value)}>
                  {TYPOGRAPHY_PAIRINGS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button variant="outline" loading={rebuild.isPending} onClick={() => rebuild.mutate()}>
              Rebuild
            </Button>
          </div>
        </Section>
        <Section title="Verified facts" description="Only these may appear verbatim in copy; anything else trips the hallucination guard.">
          {brief?.verifiedFacts?.length ? (
            <ul className="list-disc pl-4 text-xs">
              {brief.verifiedFacts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-muted-fg">None recorded in the brief.</div>
          )}
        </Section>
        {s.copyViolations ? (
          <Note tone="critical">
            Last build recorded copy violations:
            <pre className="mt-1 whitespace-pre-wrap text-xs">{JSON.stringify(s.copyViolations, null, 2)}</pre>
          </Note>
        ) : null}
      </div>
    </div>
  );
}
