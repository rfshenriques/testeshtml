/**
 * Design studio: the generated mockup inside a frame with live controls for template family, colour palette
 * (fixed schemes and palettes derived from the lead's own photos), typography and device width.
 * Every change renders the real page for this lead (built on demand by the API and cached); "Apply" rebuilds
 * and republishes the preview at the same URL.
 */
import * as React from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, Monitor, PanelLeftClose, PanelLeftOpen, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { COLOUR_SCHEME_LABEL, PALETTES, TEMPLATE_FAMILY_LABEL, TYPOGRAPHY, TYPOGRAPHY_LABEL, resolvePalette, type Palette, type TemplateFamily } from '@sitewright/shared-types';
import { api, ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Loading, SegmentedControl, Skeleton } from '@/components/ui';
import type { Brand, ColourScheme, GeneratedSite, SiteVariants, Typography } from '@/lib/types';
import { describeCombo, sameCombo, useVariantHtml, type StyleCombo } from './useVariant';

type Device = 'desktop' | 'tablet' | 'mobile';
const DEVICE_WIDTH: Record<Device, number | null> = { desktop: null, tablet: 834, mobile: 390 };
const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 3 * 60_000;

export function StudioPage() {
  const { id = '' } = useParams();
  return <Studio leadId={id} />;
}

function Studio({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const lead = useQuery({ queryKey: keys.lead(leadId), queryFn: () => api.leads.get(leadId) });
  const variants = useQuery({ queryKey: keys.siteVariants(leadId), queryFn: () => api.leads.siteVariants(leadId), staleTime: 5 * 60_000, meta: { silent: true } });
  const site = useQuery({ queryKey: [...keys.lead(leadId), 'site'], queryFn: () => api.leads.site(leadId), retry: false, meta: { silent: true } });

  const [combo, setCombo] = React.useState<StyleCombo | null>(null);
  const [device, setDevice] = React.useState<Device>('desktop');
  const [railOpen, setRailOpen] = React.useState(true);
  const [confirm, setConfirm] = React.useState(false);
  const [adopting, setAdopting] = React.useState<{ combo: StyleCombo; startedAt: number } | null>(null);

  // Start from what is live; otherwise the family recommended for the lead's vertical.
  React.useEffect(() => {
    if (combo || !variants.data) return;
    const v = variants.data;
    const vertical = lead.data?.lead.vertical ?? null;
    const recommended = v.templates.find((t) => vertical && t.verticals.includes(vertical))?.id ?? v.templates[0]?.id ?? 'professional';
    setCombo(v.current ?? { templateId: String(recommended), colourScheme: v.brand ? 'brand' : 'a', typography: 'a' });
  }, [variants.data, lead.data, combo]);

  const rebuild = useMutation({
    mutationFn: (c: StyleCombo) => api.leads.rebuild(leadId, c),
    onSuccess: (_r, c) => {
      setAdopting({ combo: c, startedAt: Date.now() });
      toast.info('Rebuild enqueued', `Rebuilding and republishing with ${describeCombo(c)}…`);
    },
  });
  const poll = useQuery({
    queryKey: [...keys.lead(leadId), 'site', 'poll'],
    queryFn: () => api.leads.site(leadId),
    enabled: adopting !== null,
    refetchInterval: adopting ? POLL_MS : false,
    staleTime: 0,
    retry: false,
    meta: { silent: true },
  });
  React.useEffect(() => {
    if (!adopting) return;
    const s = poll.data;
    if (s && poll.dataUpdatedAt >= adopting.startedAt && sameCombo(s, adopting.combo)) {
      setAdopting(null);
      toast.success('Applied', s.previewUrl ? `Republished at ${s.previewUrl}` : 'Rebuilt (not published yet).');
      void qc.invalidateQueries({ queryKey: keys.siteVariants(leadId) });
      void qc.invalidateQueries({ queryKey: keys.lead(leadId) });
      return;
    }
    if (Date.now() - adopting.startedAt > POLL_TIMEOUT_MS) {
      setAdopting(null);
      toast.error('Rebuild is taking longer than expected', 'The job is still queued; check the lead timeline in a minute.');
    }
  }, [poll.data, poll.dataUpdatedAt, adopting, qc, leadId]);

  const name = lead.data?.lead.businessName ?? '…';
  const v = variants.data;
  const current = v?.current ?? null;
  const dirty = !!combo && !sameCombo(combo, current);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <Button variant="ghost" size="sm" onClick={() => setRailOpen((o) => !o)} aria-label={railOpen ? 'Hide controls' : 'Show controls'} aria-pressed={railOpen}>
          {railOpen ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
        </Button>
        <Link to={`/leads/${leadId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Lead</span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-fg">
            Design studio{combo ? <> · <span className="font-mono">{describeCombo(combo)}</span></> : null}
            {dirty && <Badge variant="warning" className="ml-2 align-middle">Not applied</Badge>}
            {adopting && <Badge variant="info" className="ml-2 align-middle">Rebuilding…</Badge>}
          </div>
        </div>
        <SegmentedControl
          aria-label="Device"
          value={device}
          onChange={setDevice}
          options={[
            { value: 'desktop', label: <><Monitor className="size-3.5" aria-hidden /> <span className="hidden md:inline">Desktop</span></> },
            { value: 'tablet', label: <><Tablet className="size-3.5" aria-hidden /> <span className="hidden md:inline">Tablet</span></> },
            { value: 'mobile', label: <><Smartphone className="size-3.5" aria-hidden /> <span className="hidden md:inline">Phone</span></> },
          ]}
        />
        {site.data?.previewUrl && (
          <a className="hidden items-center gap-1 text-sm text-primary hover:underline lg:inline-flex" href={site.data.previewUrl} target="_blank" rel="noreferrer noopener">
            Published preview <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        <Button size="sm" disabled={!combo || !dirty || adopting !== null} loading={rebuild.isPending} onClick={() => setConfirm(true)}>
          <RefreshCw className="size-3.5" aria-hidden /> Apply & republish
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {railOpen && (
          <aside className="w-[300px] shrink-0 overflow-y-auto border-r bg-card" aria-label="Design controls">
            {variants.isLoading ? (
              <Loading label="Loading…" className="p-4" />
            ) : variants.isError ? (
              <div className="p-4">
                {variants.error instanceof ApiError && variants.error.status === 422 ? (
                  <EmptyState title="Profile the lead first" description="The studio needs a classification. Run Profile (classify) from the lead drawer." />
                ) : (
                  <ErrorState error={variants.error} onRetry={() => variants.refetch()} />
                )}
              </div>
            ) : v && combo ? (
              <Rail v={v} combo={combo} vertical={lead.data?.lead.vertical ?? null} onChange={setCombo} />
            ) : null}
          </aside>
        )}
        <main id="main" className="min-w-0 flex-1 overflow-auto bg-muted/40">
          {combo ? <Preview leadId={leadId} combo={combo} device={device} /> : <Loading className="p-6" />}
        </main>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          if (!combo) return;
          await rebuild.mutateAsync(combo);
          setConfirm(false);
        }}
        title={combo ? `Rebuild and republish the mockup for ${name}?` : ''}
        confirmLabel="Rebuild & republish"
        blastRadius={
          combo ? (
            <>
              The published preview for <strong>{name}</strong> is rebuilt with <strong>{TEMPLATE_FAMILY_LABEL[combo.templateId as TemplateFamily] ?? combo.templateId}</strong>, palette <strong>{COLOUR_SCHEME_LABEL[combo.colourScheme]}</strong> and typography <strong>{TYPOGRAPHY_LABEL[combo.typography]}</strong>, then republished at the same URL. Anyone holding the link sees the new design once the job finishes (usually under a minute). Copy is unchanged.
            </>
          ) : null
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Controls

function Rail({ v, combo, vertical, onChange }: { v: SiteVariants; combo: StyleCombo; vertical: string | null; onChange: (c: StyleCombo) => void }) {
  const family = (combo.templateId in PALETTES ? combo.templateId : 'professional') as TemplateFamily;
  const brand = v.brand;
  return (
    <div className="divide-y">
      <RailSection title="Template" hint="One design per kind of business; the recommended one matches this lead's classification.">
        <ul className="space-y-1" role="radiogroup" aria-label="Template family">
          {v.templates.map((t) => {
            const selected = t.id === combo.templateId;
            const recommended = !!vertical && t.verticals.includes(vertical);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange({ ...combo, templateId: String(t.id) })}
                  className={cn('flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-1.5 text-left transition-colors hover:bg-muted/60', selected ? 'border-primary bg-primary/5' : 'border-transparent')}
                >
                  <span className="flex w-full items-center gap-2 text-sm">
                    <span className={cn('flex-1 truncate', selected && 'font-medium')}>{t.label ?? TEMPLATE_FAMILY_LABEL[t.id as TemplateFamily] ?? t.id}</span>
                    {recommended && <Badge variant="info">Recommended</Badge>}
                    {selected && <Check className="size-4 text-primary" aria-hidden />}
                  </span>
                  {selected && t.concept && <span className="text-xs text-muted-fg">{t.concept}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </RailSection>

      <RailSection title="Colour palette" hint={brand ? `“Their colours” come from the business's own listing photos${brand.source === 'operator' ? ' (set by an operator)' : ''}.` : 'No palette could be derived from the listing photos yet, so only the fixed schemes are available.'}>
        {brand && brand.swatches.length > 0 && (
          <div className="mb-3 flex items-center gap-1.5" aria-label="Colours found in their photos">
            {brand.swatches.map((c, i) => (
              <span key={`${c}-${i}`} className="inline-block size-4 rounded-sm border" style={{ backgroundColor: c }} title={c} />
            ))}
            <span className="ml-1 text-xs text-muted-fg">from their photos</span>
          </div>
        )}
        <ul className="space-y-1" role="radiogroup" aria-label="Colour palette">
          {v.colourSchemes.map((scheme) => {
            const isBrand = scheme.startsWith('brand');
            const disabled = isBrand && !brand;
            const palette = disabled ? null : resolvePalette(family, scheme, brand ? toBrandInput(brand) : null);
            const selected = scheme === combo.colourScheme;
            return (
              <li key={scheme}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => onChange({ ...combo, colourScheme: scheme })}
                  className={cn('flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent', selected ? 'border-primary bg-primary/5' : 'border-transparent')}
                >
                  <PaletteDots palette={palette} />
                  <span className="flex-1 truncate">{COLOUR_SCHEME_LABEL[scheme]}</span>
                  {selected && <Check className="size-4 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </RailSection>

      <RailSection title="Typography" hint="System font stacks only, so the page loads instantly everywhere.">
        <ul className="space-y-1" role="radiogroup" aria-label="Typography">
          {v.typography.map((t) => {
            const pairing = TYPOGRAPHY[t];
            const selected = t === combo.typography;
            return (
              <li key={t}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange({ ...combo, typography: t })}
                  className={cn('flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/60', selected ? 'border-primary bg-primary/5' : 'border-transparent')}
                >
                  <span className="w-12 shrink-0 text-2xl leading-none" style={{ fontFamily: pairing.display, fontWeight: pairing.displayWeight, letterSpacing: pairing.displayTracking, textTransform: pairing.displayTransform }} aria-hidden>
                    Aa
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{TYPOGRAPHY_LABEL[t] ?? pairing.name}</span>
                    <span className="block truncate text-xs text-muted-fg" style={{ fontFamily: pairing.body }}>
                      {describeType(t)}
                    </span>
                  </span>
                  {selected && <Check className="size-4 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </RailSection>
    </div>
  );
}

function describeType(t: Typography): string {
  return { a: 'Serif headlines, clean sans body', b: 'Bold grotesk headlines, mono labels', c: 'Rounded geometric headlines', d: 'Serif throughout, classic', e: 'Condensed uppercase, technical' }[t] ?? '';
}

function toBrandInput(b: Brand) {
  return { primary: b.primary, accent: b.accent, heroBg: b.heroBg };
}

function PaletteDots({ palette }: { palette: Palette | null }) {
  const colours = palette ? [palette.bg, palette.primary, palette.accent, palette.heroBg] : ['#e5e5e5', '#d4d4d4', '#c4c4c4', '#a3a3a3'];
  return (
    <span className="inline-flex shrink-0 -space-x-1" aria-hidden>
      {colours.map((c, i) => (
        <span key={i} className="inline-block size-5 rounded-full border-2 border-card" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

function RailSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="px-3 py-4">
      <h2 className="t-label mb-1 px-3">{title}</h2>
      {hint && <p className="mb-3 px-3 text-xs text-muted-fg">{hint}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Preview

function Preview({ leadId, combo, device }: { leadId: string; combo: StyleCombo; device: Device }) {
  const q = useVariantHtml(leadId, combo, true);
  const width = DEVICE_WIDTH[device];
  const label = `${TEMPLATE_FAMILY_LABEL[combo.templateId as TemplateFamily] ?? combo.templateId} · ${COLOUR_SCHEME_LABEL[combo.colourScheme]} · ${TYPOGRAPHY_LABEL[combo.typography]}`;
  return (
    <div className={cn('flex min-h-full justify-center', width ? 'p-4 sm:p-6' : 'p-0')}>
      <div className={cn('relative bg-white', width ? 'rounded-xl border shadow-sm' : 'w-full')} style={width ? { width, maxWidth: '100%' } : undefined}>
        {q.isPending && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-card/80" role="status">
            <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm">Building {label}… first build takes a few seconds.</div>
          </div>
        )}
        {q.isError ? (
          <div className="p-6">
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : (
          <iframe
            key={`${combo.templateId}-${combo.colourScheme}-${combo.typography}`}
            title={`${label} preview`}
            srcDoc={q.data ?? ''}
            sandbox="allow-same-origin"
            className={cn('block w-full border-0 bg-white', width ? 'h-[calc(100vh-7.5rem)] rounded-xl' : 'h-[calc(100vh-3.5rem)]')}
          />
        )}
        {!q.isPending && !q.data && !q.isError && <Skeleton className="absolute inset-0" />}
      </div>
    </div>
  );
}
