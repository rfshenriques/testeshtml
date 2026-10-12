/**
 * "Styles" tab of the lead drawer: a gallery of every template family × colour scheme for the chosen typography,
 * each rendered by the API (`GET …/site/variant`) and shown in a scaled-down, non-interactive iframe.
 * Adopting a style calls `POST …/site/rebuild` and polls `GET …/site` until the new combination is live.
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Maximize2, Monitor, Smartphone } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Loading, Note, Section, Skeleton } from '@/components/ui';
import type { Brand, ColourScheme, GeneratedSite, LeadDetail, SiteImage, SiteVariants, Typography } from '@/lib/types';

export interface StyleCombo { templateId: string; colourScheme: ColourScheme; typography: Typography }

export const SCHEME_LABEL: Record<ColourScheme, string> = { a: 'Scheme A', b: 'Scheme B', c: 'Scheme C', brand: 'From their photos' };
export const TYPOGRAPHY_LABEL: Record<Typography, string> = { a: 'Editorial', b: 'Modern' };
const PAGE_W = 1280;
const PAGE_H = 800;
const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 3 * 60_000;

const sameCombo = (a: StyleCombo | null | undefined, b: StyleCombo | null | undefined) => !!a && !!b && a.templateId === b.templateId && a.colourScheme === b.colourScheme && a.typography === b.typography;
const describe = (c: StyleCombo) => `${c.templateId} / ${c.colourScheme} / ${c.typography}`;

// ---------------------------------------------------------------------------------------------------------------------
// Tab

export function StylesTab({ d, refresh }: { d: LeadDetail; refresh: () => void }) {
  const qc = useQueryClient();
  const id = d.lead.id;
  const variants = useQuery({ queryKey: keys.siteVariants(id), queryFn: () => api.leads.siteVariants(id), staleTime: 5 * 60_000, meta: { silent: true } });
  const [typography, setTypography] = React.useState<Typography | null>(null);
  const typo: Typography = typography ?? variants.data?.current?.typography ?? 'a';

  // Adoption: rebuild, then poll the site until the requested combination is what is published.
  const [adopting, setAdopting] = React.useState<{ combo: StyleCombo; startedAt: number } | null>(null);
  const [adopted, setAdopted] = React.useState<GeneratedSite | null>(null);
  const rebuild = useMutation({
    mutationFn: (combo: StyleCombo) => api.leads.rebuild(id, combo),
    onSuccess: (_r, combo) => {
      setAdopted(null);
      setAdopting({ combo, startedAt: Date.now() });
      toast.info('Rebuild enqueued', `Waiting for ${describe(combo)} to be rebuilt and republished…`);
    },
  });
  const poll = useQuery({
    queryKey: [...keys.lead(id), 'site', 'poll'],
    queryFn: () => api.leads.site(id),
    enabled: adopting !== null,
    refetchInterval: adopting ? POLL_MS : false,
    staleTime: 0,
    retry: false,
    meta: { silent: true },
  });
  React.useEffect(() => {
    if (!adopting) return;
    const site = poll.data;
    if (site && poll.dataUpdatedAt >= adopting.startedAt && sameCombo(site, adopting.combo)) {
      setAdopting(null);
      setAdopted(site);
      toast.success('Style adopted', site.previewUrl ? `Republished at ${site.previewUrl}` : 'Rebuilt (not published yet).');
      refresh();
      void qc.invalidateQueries({ queryKey: keys.siteVariants(id) });
      return;
    }
    if (Date.now() - adopting.startedAt > POLL_TIMEOUT_MS) {
      setAdopting(null);
      toast.error('Rebuild is taking longer than expected', 'The job is still queued; check the Site & quote tab or the timeline in a minute.');
    }
  }, [poll.data, poll.dataUpdatedAt, adopting, refresh, qc, id]);

  if (variants.isLoading) return <Loading label="Loading style gallery…" />;
  if (variants.isError) {
    const err = variants.error;
    if (err instanceof ApiError && err.status === 422) {
      return <EmptyState title="Profile the lead first" description={<>{err.message || 'The style gallery needs a classification.'} Run <strong>Profile (classify)</strong> under Notes &amp; actions; the gallery unlocks at stage profiled or later.</>} />;
    }
    return <ErrorState error={err} onRetry={() => variants.refetch()} />;
  }
  const v = variants.data;
  if (!v) return <Loading />;

  return (
    <div className="space-y-4">
      <BrandHeader brand={v.brand} images={v.images} />
      {adopting && (
        <Note tone="warning">
          Rebuilding and republishing <strong>{d.lead.businessName}</strong> with <span className="font-mono">{describe(adopting.combo)}</span>… this usually takes under a minute. The gallery stays usable meanwhile.
        </Note>
      )}
      {adopted && (
        <Note tone="info">
          Now live: <span className="font-mono">{describe(adopted)}</span>.{' '}
          {adopted.previewUrl ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={adopted.previewUrl} target="_blank" rel="noreferrer noopener">
              Open the new preview <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <>Built but not published yet — use “Publish preview” under Notes &amp; actions.</>
          )}
        </Note>
      )}
      <Section
        title="Style gallery"
        description="Every template family × colour scheme, built with this lead's real copy and photos. Thumbnails render as you scroll (first build of a combination takes ~5 s)."
        actions={<TypographyToggle value={typo} options={v.typography} onChange={setTypography} />}
      >
        <StylesGrid leadId={id} businessName={d.lead.businessName} variants={v} typography={typo} adopting={adopting?.combo ?? null} onAdopt={(combo) => rebuild.mutateAsync(combo)} />
      </Section>
    </div>
  );
}

function TypographyToggle({ value, options, onChange }: { value: Typography; options: Typography[]; onChange: (t: Typography) => void }) {
  return (
    <div role="radiogroup" aria-label="Typography" className="inline-flex h-8 items-center gap-1 rounded-md bg-muted p-1 text-xs">
      {options.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} onClick={() => onChange(t)} className={cn('h-6 rounded px-2 font-medium transition-colors', value === t ? 'bg-card text-fg shadow-xs' : 'text-muted-fg hover:text-fg')}>
          <span className="font-mono">{t}</span> {TYPOGRAPHY_LABEL[t] ?? t}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Brand + photos header

export function BrandHeader({ brand, images }: { brand: Brand | null; images: SiteImage[] }) {
  return (
    <Section title="Brand & photos" description="From the business's Google listing. Shown with attribution; replaced by the client's own photography after signing.">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <div className="text-xs font-medium text-muted-fg">Palette {brand ? <Badge variant="outline" className="ml-1">from {brand.source === 'photos' ? 'their photos' : 'operator'}</Badge> : null}</div>
          {brand ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-3 text-xs">
                <Swatch colour={brand.primary} label="primary" large />
                <Swatch colour={brand.accent} label="accent" large />
                {brand.heroBg && <Swatch colour={brand.heroBg} label="hero bg" large />}
              </div>
              {brand.swatches.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Extracted swatches">
                  {brand.swatches.map((c, i) => (
                    <Swatch key={`${c}-${i}`} colour={c} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-fg">No palette yet: the listing has no usable photos to derive colours from, so “From their photos” would render the same as scheme A.</p>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-muted-fg">Photos ({images.length})</div>
          {images.length === 0 ? (
            <p className="mt-2 text-xs text-muted-fg">No photos on the listing; the mockup uses neutral placeholders.</p>
          ) : (
            <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <li key={`${img.url}-${i}`} className="w-36 shrink-0">
                  <img src={img.url} alt={img.alt} loading="lazy" className="h-24 w-36 rounded-md border bg-muted object-cover" />
                  <div className="mt-1 truncate text-[11px] text-muted-fg" title={img.credit ?? undefined}>
                    {img.credit ?? 'No attribution supplied'}
                    {img.source ? ` · ${img.source.replace(/_/g, ' ')}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function Swatch({ colour, label, large }: { colour: string; label?: string; large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={colour}>
      <span className={cn('inline-block rounded border', large ? 'size-7' : 'size-5')} style={{ backgroundColor: colour }} aria-hidden />
      {label ? (
        <span>
          <span className="block">{label}</span>
          <span className="block font-mono text-[11px] text-muted-fg">{colour}</span>
        </span>
      ) : (
        <span className="sr-only">{colour}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Grid

export function StylesGrid({ leadId, businessName, variants, typography, adopting, onAdopt }: { leadId: string; businessName: string; variants: SiteVariants; typography: Typography; adopting: StyleCombo | null; onAdopt: (combo: StyleCombo) => Promise<unknown> }) {
  const [confirm, setConfirm] = React.useState<StyleCombo | null>(null);
  const [open, setOpen] = React.useState<StyleCombo | null>(null);
  const combos: StyleCombo[] = variants.templates.flatMap((t) => variants.colourSchemes.map((colourScheme) => ({ templateId: t.id, colourScheme, typography })));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="styles-grid">
        {combos.map((combo) => (
          <VariantCard
            key={`${combo.templateId}-${combo.colourScheme}-${combo.typography}`}
            leadId={leadId}
            combo={combo}
            brandAvailable={variants.brand !== null}
            current={sameCombo(variants.current, combo)}
            adopting={sameCombo(adopting, combo)}
            onOpen={() => setOpen(combo)}
            onUse={() => setConfirm(combo)}
          />
        ))}
      </div>
      <VariantModal leadId={leadId} combo={open} current={!!open && sameCombo(variants.current, open)} onClose={() => setOpen(null)} onUse={() => { if (open) { setConfirm(open); setOpen(null); } }} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          await onAdopt(confirm);
          setConfirm(null);
        }}
        title={confirm ? `Rebuild and republish the mockup for ${businessName} with ${describe(confirm)}?` : ''}
        confirmLabel="Rebuild & republish"
        blastRadius={
          confirm ? (
            <>
              The published preview for <strong>{businessName}</strong> is rebuilt with template <strong>{confirm.templateId}</strong>, colour scheme <strong>{SCHEME_LABEL[confirm.colourScheme]}</strong> and typography <strong>{TYPOGRAPHY_LABEL[confirm.typography]}</strong>, then republished at the same preview URL. Anyone holding the link sees the new design once the job finishes (usually under a minute). Copy is unchanged.
            </>
          ) : null
        }
      />
    </>
  );
}

function useVariantHtml(leadId: string, combo: StyleCombo, enabled: boolean) {
  return useQuery({
    queryKey: keys.siteVariant(leadId, combo.templateId, combo.colourScheme, combo.typography),
    queryFn: ({ signal }) => api.leads.siteVariantHtml(leadId, { template: combo.templateId, colourScheme: combo.colourScheme, typography: combo.typography }, signal),
    enabled,
    staleTime: Infinity,
    gcTime: 15 * 60_000,
    retry: 1,
    meta: { silent: true },
  });
}

/** True once the element has scrolled into (or near) view. Without IntersectionObserver (old browsers) everything counts as visible. */
function useInView<T extends Element>(ref: React.RefObject<T | null>, rootMargin = '240px') {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, inView]);
  return inView;
}

function useWidth<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || el.offsetWidth || 0);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || el.offsetWidth || 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** A 1280×800 page scaled with a CSS transform to the card width; never interactive. */
function ScaledPage({ html, title }: { html: string; title: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const scale = w > 0 ? w / PAGE_W : 0;
  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>
      {scale > 0 && (
        <iframe
          title={title}
          srcDoc={html}
          sandbox=""
          tabIndex={-1}
          aria-hidden
          scrolling="no"
          className="pointer-events-none absolute top-0 left-0 border-0 bg-white"
          style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      )}
    </div>
  );
}

function VariantCard({ leadId, combo, brandAvailable, current, adopting, onOpen, onUse }: { leadId: string; combo: StyleCombo; brandAvailable: boolean; current: boolean; adopting: boolean; onOpen: () => void; onUse: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const disabled = combo.colourScheme === 'brand' && !brandAvailable;
  const inView = useInView(ref);
  const q = useVariantHtml(leadId, combo, inView && !disabled);
  const label = `${combo.templateId} · ${SCHEME_LABEL[combo.colourScheme]} · ${TYPOGRAPHY_LABEL[combo.typography]}`;
  return (
    <div
      ref={ref}
      data-testid="style-card"
      data-template={combo.templateId}
      data-scheme={combo.colourScheme}
      data-disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      aria-label={label}
      className={cn('flex flex-col overflow-hidden rounded-lg border bg-card text-card-fg shadow-xs', current && 'border-primary ring-2 ring-primary/40', disabled && 'opacity-70')}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="min-w-0">
          <div className="truncate font-medium">{combo.templateId}</div>
          <div className="truncate text-muted-fg">{SCHEME_LABEL[combo.colourScheme]}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          {current && <Badge variant="primary">Current</Badge>}
          {adopting && <Badge variant="warning">Rebuilding…</Badge>}
          {combo.colourScheme === 'brand' && !disabled && <Badge variant="outline">brand</Badge>}
        </div>
      </div>
      <div className="border-y">
        {disabled ? (
          <div className="flex items-center justify-center p-4 text-center text-xs text-muted-fg" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>
            No palette could be derived from the listing's photos, so this would look identical to Scheme A.
          </div>
        ) : !inView || q.isPending ? (
          <div className="relative" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }} role="status" aria-label={`Loading ${label}`}>
            <Skeleton className="absolute inset-0 rounded-none" />
            {q.isFetching && <Loading label="Building…" className="absolute inset-x-0 bottom-0 justify-center p-2 text-xs" />}
          </div>
        ) : q.isError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-xs" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>
            <span className="text-critical">{q.error instanceof Error ? q.error.message : 'Build failed'}</span>
            <Button size="sm" variant="outline" onClick={() => q.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <ScaledPage html={q.data ?? ''} title={`${label} thumbnail`} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onOpen} aria-label={`Open full size: ${label}`}>
          <Maximize2 className="size-3.5" aria-hidden /> Open full size
        </Button>
        <Button size="sm" variant={current ? 'outline' : 'default'} disabled={disabled || current || adopting} onClick={onUse} aria-label={`Use this style: ${label}`}>
          {current ? 'In use' : 'Use this style'}
        </Button>
      </div>
    </div>
  );
}

function VariantModal({ leadId, combo, current, onClose, onUse }: { leadId: string; combo: StyleCombo | null; current: boolean; onClose: () => void; onUse: () => void }) {
  const [device, setDevice] = React.useState<'desktop' | 'mobile'>('desktop');
  if (!combo) return null;
  return <VariantModalBody leadId={leadId} combo={combo} current={current} device={device} setDevice={setDevice} onClose={onClose} onUse={onUse} />;
}

function VariantModalBody({ leadId, combo, current, device, setDevice, onClose, onUse }: { leadId: string; combo: StyleCombo; current: boolean; device: 'desktop' | 'mobile'; setDevice: (d: 'desktop' | 'mobile') => void; onClose: () => void; onUse: () => void }) {
  const q = useVariantHtml(leadId, combo, true);
  const label = `${combo.templateId} · ${SCHEME_LABEL[combo.colourScheme]} · ${TYPOGRAPHY_LABEL[combo.typography]}`;
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={label}
      description={<span className="font-mono text-xs">{describe(combo)}</span>}
      footer={
        <>
          <div role="radiogroup" aria-label="Device" className="mr-auto inline-flex h-8 items-center gap-1 rounded-md bg-muted p-1 text-xs">
            <button type="button" role="radio" aria-checked={device === 'desktop'} onClick={() => setDevice('desktop')} className={cn('inline-flex h-6 items-center gap-1 rounded px-2 font-medium', device === 'desktop' ? 'bg-card text-fg shadow-xs' : 'text-muted-fg hover:text-fg')}>
              <Monitor className="size-3.5" aria-hidden /> Desktop
            </button>
            <button type="button" role="radio" aria-checked={device === 'mobile'} onClick={() => setDevice('mobile')} className={cn('inline-flex h-6 items-center gap-1 rounded px-2 font-medium', device === 'mobile' ? 'bg-card text-fg shadow-xs' : 'text-muted-fg hover:text-fg')}>
              <Smartphone className="size-3.5" aria-hidden /> Mobile (390px)
            </button>
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={current} onClick={onUse}>
            {current ? 'In use' : 'Use this style'}
          </Button>
        </>
      }
    >
      {q.isPending ? (
        <Loading label="Building this variant (first build takes ~5 s)…" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className={cn('flex justify-center', device === 'mobile' && 'bg-muted/40 py-3')}>
          <iframe title={`${label} full size`} srcDoc={q.data} sandbox="allow-same-origin" className={cn('h-[70vh] rounded-md border bg-white', device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full')} />
        </div>
      )}
    </Dialog>
  );
}
