import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { X } from 'lucide-react';
import { COLOUR_SCHEMES, TYPOGRAPHY_PAIRINGS, SiteCopySchema } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtDate, relTime } from '@/lib/utils';
import { PageHeader, QueryState, Section, SubSection, Divider, Button, Field, Input, Select, Textarea, Loading, EmptyState, ErrorState, Note, Table, THead, TBody, TR, TH, TD, CellSub, StatusLabel } from '@/components/ui';
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
      <PageHeader title="Generator" description="Template library, sample previews, recent builds and the copy editor for a lead's site." />
      <div className="space-y-6">
        <Section title="Template library" description="Six families, each with three colour schemes and two typography pairings.">
          <QueryState query={templates}>
            {(list) => (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <TemplateCard key={t.id} t={t} active={selected === t.id} onSelect={() => setSelected(t.id)} />
                ))}
              </div>
            )}
          </QueryState>
          {selected && chosen && (
            <div className="mt-5 space-y-3 border-t pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Colour scheme" htmlFor="g-scheme">
                  <Select id="g-scheme" className="w-32" value={scheme} onChange={(e) => setScheme(e.target.value)}>
                    {(chosen.colourSchemes?.length ? chosen.colourSchemes : COLOUR_SCHEMES).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Typography" htmlFor="g-typo">
                  <Select id="g-typo" className="w-32" value={typo} onChange={(e) => setTypo(e.target.value)}>
                    {(chosen.typography?.length ? chosen.typography : TYPOGRAPHY_PAIRINGS).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <span className="pb-2 text-sm text-muted-fg">
                  Sample of <span className="font-medium text-fg">{chosen.id}</span> with fixture data.
                </span>
              </div>
              {sample.isLoading ? <Loading label="Rendering sample…" /> : sample.isError ? <ErrorState error={sample.error} onRetry={() => sample.refetch()} /> : sample.data ? <iframe title={`${chosen.id} sample`} srcDoc={sample.data} sandbox="allow-same-origin" className="h-[560px] w-full rounded-lg border bg-white" /> : null}
            </div>
          )}
        </Section>

        <Section title="Recent builds" description="Latest generated sites across all campaigns.">
          <QueryState query={builds} empty={<EmptyState title="No builds yet" description="Sites are built after profiling; trigger “Generate site” from a lead." />} loading={<Loading rows={4} />}>
            {(rows) => (
              <Table bare>
                <THead>
                  <tr>
                    <TH>Lead</TH>
                    <TH>Template</TH>
                    <TH>Preview</TH>
                    <TH numeric>Views</TH>
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
                        {b.templateId}
                        <CellSub>
                          scheme {b.colourScheme} · type {b.typography}
                        </CellSub>
                      </TD>
                      <TD>
                        {b.takenDownAt ? (
                          <StatusLabel status="taken_down" />
                        ) : b.previewUrl ? (
                          <a className="text-primary hover:underline" href={b.previewUrl} target="_blank" rel="noreferrer noopener">
                            Open preview
                          </a>
                        ) : (
                          <StatusLabel status="unpublished" />
                        )}
                      </TD>
                      <TD numeric>{b.views}</TD>
                      <TD className="text-sm text-muted-fg">{relTime(b.updatedAt)}</TD>
                      <TD className="text-sm text-muted-fg">{fmtDate(b.expiresAt)}</TD>
                      <TD className="text-right">
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
          description="Edit every field of a lead's generated site. Saving enqueues a rebuild."
          actions={
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = (new FormData(e.currentTarget).get('leadId') as string).trim();
                setSp(v ? { leadId: v } : {});
              }}
            >
              <Input id="g-lead" name="leadId" aria-label="Lead id" defaultValue={leadId} className="w-64 font-mono text-sm" placeholder="Paste a lead id" />
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
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn('flex flex-col rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring', active && 'border-primary bg-[color-mix(in_oklab,var(--primary)_6%,transparent)] hover:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{t.id}</div>
        <span className={cn('text-sm', active ? 'font-medium text-primary' : 'text-muted-fg')}>{active ? 'Previewing' : 'Preview'}</span>
      </div>
      <div className="mt-1 text-sm text-muted-fg">{t.verticals.join(', ')}</div>
      <div className="mt-2 text-xs text-muted-fg">{t.sections.join(' · ')}</div>
    </button>
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

  if (site.isLoading) return <Loading rows={6} />;
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
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-fg">
          <Link to={`/leads/${leadId}`} className="font-medium text-fg hover:underline">
            {s.lead?.businessName ?? leadId}
          </Link>
          <span>
            {s.templateId} · build {s.buildHash.slice(0, 8)} · {s.views} views · expires {fmtDate(s.expiresAt)}
          </span>
          {s.previewUrl && (
            <a className="text-primary hover:underline" href={s.previewUrl} target="_blank" rel="noreferrer noopener">
              Open preview
            </a>
          )}
        </div>
        <SubSection title="Meta">
          <div className="grid gap-3 sm:grid-cols-2">
            {text('Title (≤ 70)', copy.meta.title, (v) => setCopy({ ...copy, meta: { ...copy.meta, title: v } }), { max: 70 })}
            {text('Description (≤ 170)', copy.meta.description, (v) => setCopy({ ...copy, meta: { ...copy.meta, description: v } }), { max: 170 })}
          </div>
        </SubSection>
        <Divider />
        <SubSection title="Hero">
          <div className="grid gap-3">
            {text('Headline', copy.hero.headline, (v) => setCopy({ ...copy, hero: { ...copy.hero, headline: v } }))}
            {text('Subhead', copy.hero.subhead, (v) => setCopy({ ...copy, hero: { ...copy.hero, subhead: v } }), { rows: 2 })}
            {text('CTA label', copy.hero.ctaLabel, (v) => setCopy({ ...copy, hero: { ...copy.hero, ctaLabel: v } }))}
          </div>
        </SubSection>
        <Divider />
        <SubSection title="About">
          <div className="grid gap-3">
            {text('Heading', copy.about.heading, (v) => setCopy({ ...copy, about: { ...copy.about, heading: v } }))}
            {text('Body', copy.about.body, (v) => setCopy({ ...copy, about: { ...copy.about, body: v } }), { rows: 4 })}
          </div>
        </SubSection>
        <Divider />
        <SubSection title="Services" description="1–8 entries.">
          <div className="space-y-3">
            {copy.services.map((sv, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                {text(`Name ${i + 1}`, sv.name, (v) => setCopy({ ...copy, services: copy.services.map((x, j) => (j === i ? { ...x, name: v } : x)) }))}
                {text('Description', sv.description, (v) => setCopy({ ...copy, services: copy.services.map((x, j) => (j === i ? { ...x, description: v } : x)) }))}
                <Button variant="ghost" size="icon" className="self-end text-muted-fg" aria-label={`Remove service ${i + 1}`} disabled={copy.services.length <= 1} onClick={() => setCopy({ ...copy, services: copy.services.filter((_, j) => j !== i) })}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={copy.services.length >= 8} onClick={() => setCopy({ ...copy, services: [...copy.services, { name: '', description: '' }] })}>
              Add service
            </Button>
          </div>
        </SubSection>
        <Divider />
        <SubSection title="Why us" description="1–4 entries.">
          <div className="space-y-3">
            {copy.whyUs.map((w, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                {text(`Title ${i + 1}`, w.title, (v) => setCopy({ ...copy, whyUs: copy.whyUs.map((x, j) => (j === i ? { ...x, title: v } : x)) }))}
                {text('Body', w.body, (v) => setCopy({ ...copy, whyUs: copy.whyUs.map((x, j) => (j === i ? { ...x, body: v } : x)) }))}
                <Button variant="ghost" size="icon" className="self-end text-muted-fg" aria-label={`Remove whyUs ${i + 1}`} disabled={copy.whyUs.length <= 1} onClick={() => setCopy({ ...copy, whyUs: copy.whyUs.filter((_, j) => j !== i) })}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={copy.whyUs.length >= 4} onClick={() => setCopy({ ...copy, whyUs: [...copy.whyUs, { title: '', body: '' }] })}>
              Add reason
            </Button>
          </div>
        </SubSection>
        <Divider />
        <SubSection title="Call to action">
          <div className="grid gap-3">
            {text('Heading', copy.cta.heading, (v) => setCopy({ ...copy, cta: { ...copy.cta, heading: v } }))}
            {text('Body', copy.cta.body, (v) => setCopy({ ...copy, cta: { ...copy.cta, body: v } }), { rows: 2 })}
            {text('Button label', copy.cta.buttonLabel, (v) => setCopy({ ...copy, cta: { ...copy.cta, buttonLabel: v } }))}
          </div>
        </SubSection>
        <Divider />
        <Field label="Placeholders used" hint="Comma separated; disclosed in the page footer.">
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
      <div className="space-y-6 lg:border-l lg:pl-8">
        <SubSection title="Rebuild with different styling">
          <div className="space-y-3">
            <Field label="Template">
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id}>{t.id}</option>
                ))}
                {!templates.some((t) => t.id === templateId) && templateId && <option>{templateId}</option>}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
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
        </SubSection>
        <Divider />
        <SubSection title="Verified facts" description="Only these may appear verbatim in copy; anything else trips the hallucination guard.">
          {brief?.verifiedFacts?.length ? (
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {brief.verifiedFacts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-fg">None recorded in the brief.</div>
          )}
        </SubSection>
        {s.copyViolations ? (
          <Note tone="critical">
            Last build recorded copy violations:
            <pre className="mt-1.5 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(s.copyViolations, null, 2)}</pre>
          </Note>
        ) : null}
      </div>
    </div>
  );
}
