import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CampaignGeometrySchema, type CampaignGeometry } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { Button, Dialog, Field, Input, Textarea, Switch, Note, Loading, Badge } from '@/components/ui';
import type { PlaceTypeTiers } from '@/lib/types';
import { cn } from '@/lib/utils';

type GeomKind = CampaignGeometry['kind'];

interface CityRow { name: string; lat: string; lng: string; radiusM: string }

function PlaceTypePicker({ tiers, selected, onChange }: { tiers: PlaceTypeTiers['tiers']; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const toggle = (t: string) => {
    const n = new Set(selected);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    onChange(n);
  };
  const setTier = (tier: 'A' | 'B' | 'C', on: boolean) => {
    const n = new Set(selected);
    for (const t of tiers[tier]) on ? n.add(t) : n.delete(t);
    onChange(n);
  };
  const TIER_NOTE = { A: 'Highest willingness to pay; professional and trades.', B: 'Hospitality, beauty, fitness, specialist retail.', C: 'Low ticket; include only with a cheap starter tier.' };
  return (
    <div className="space-y-3">
      {(['A', 'B', 'C'] as const).map((tier) => {
        const all = tiers[tier].every((t) => selected.has(t));
        const some = tiers[tier].some((t) => selected.has(t));
        return (
          <fieldset key={tier} className="rounded-md border p-2">
            <legend className="flex items-center gap-2 px-1 text-xs font-medium">
              Tier {tier} <span className="font-normal text-muted-fg">{TIER_NOTE[tier]}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTier(tier, !all)}>
                {all ? 'Clear tier' : some ? 'Select rest' : 'Select tier'}
              </Button>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {tiers[tier].map((t) => (
                <label key={t} className={cn('cursor-pointer rounded-full border px-2 py-0.5 text-xs select-none', selected.has(t) ? 'border-primary bg-accent text-primary' : 'hover:bg-muted')}>
                  <input type="checkbox" className="sr-only" checked={selected.has(t)} onChange={() => toggle(t)} />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function CreateCampaignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const qc = useQueryClient();
  const placeTypes = useQuery({ queryKey: keys.placeTypes, queryFn: api.campaigns.placeTypes, staleTime: Infinity, enabled: open });
  const [name, setName] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('');
  const [kind, setKind] = React.useState<GeomKind>('bbox');
  const [bbox, setBbox] = React.useState({ minLng: '', minLat: '', maxLng: '', maxLat: '' });
  const [circle, setCircle] = React.useState({ lat: '', lng: '', radiusM: '5000' });
  const [polygon, setPolygon] = React.useState('');
  const [cities, setCities] = React.useState<CityRow[]>([{ name: '', lat: '', lng: '', radiusM: '5000' }]);
  const [types, setTypes] = React.useState<Set<string>>(new Set());
  const [excluded, setExcluded] = React.useState('');
  const [budget, setBudget] = React.useState('50');
  const [maxLeads, setMaxLeads] = React.useState('');
  const [language, setLanguage] = React.useState('');
  const [includeHttpOnly, setIncludeHttpOnly] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const buildGeometry = (): CampaignGeometry | string => {
    const n = (s: string) => parseFloat(s);
    let g: unknown;
    if (kind === 'bbox') g = { kind, bbox: [n(bbox.minLng), n(bbox.minLat), n(bbox.maxLng), n(bbox.maxLat)] };
    else if (kind === 'circle') g = { kind, center: { lat: n(circle.lat), lng: n(circle.lng) }, radiusM: n(circle.radiusM) };
    else if (kind === 'polygon') {
      try {
        const parsed = JSON.parse(polygon) as { type?: string; geometry?: unknown; coordinates?: unknown };
        const geo = parsed.type === 'Feature' ? parsed.geometry : parsed;
        g = { kind, geojson: geo };
      } catch {
        return 'Polygon is not valid JSON';
      }
    } else g = { kind, cities: cities.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), lat: n(c.lat), lng: n(c.lng), radiusM: n(c.radiusM) })) };
    const r = CampaignGeometrySchema.safeParse(g);
    if (!r.success) return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    if (r.data.kind === 'bbox' && (r.data.bbox[0] >= r.data.bbox[2] || r.data.bbox[1] >= r.data.bbox[3])) return 'bbox must be [minLng, minLat, maxLng, maxLat] with min < max';
    return r.data;
  };

  const create = useMutation({
    mutationFn: api.campaigns.create,
    onSuccess: (c) => {
      toast.success('Campaign created as draft', `${c.name} — review the estimate, then start it from the detail page.`);
      void qc.invalidateQueries({ queryKey: keys.campaigns });
      onClose();
      onCreated?.(c.id);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const g = buildGeometry();
    if (typeof g === 'string') return setError(g);
    if (!name.trim()) return setError('Name is required');
    if (!/^[A-Za-z]{2}$/.test(countryCode.trim())) return setError('Country must be an ISO 3166-1 alpha-2 code (e.g. IE)');
    if (types.size === 0) return setError('Pick at least one place type');
    const b = parseFloat(budget);
    if (!(b > 0)) return setError('Budget cap must be > 0 USD');
    create.mutate({
      name: name.trim(),
      countryCode: countryCode.trim().toUpperCase(),
      geometry: g,
      includedTypes: Array.from(types),
      excludedTypes: excluded.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      budgetUsdCap: b,
      maxLeads: maxLeads ? parseInt(maxLeads, 10) : undefined,
      languageCode: language.trim() || undefined,
      includeHttpOnly,
    });
  };

  const num = (v: string, set: (s: string) => void, id: string, label: string) => (
    <Field label={label} htmlFor={id}>
      <Input id={id} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} />
    </Field>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New campaign"
      description="Created as a draft. Nothing is spent until you press Start on the campaign page."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-campaign" loading={create.isPending}>
            Create draft
          </Button>
        </>
      }
    >
      <form id="create-campaign" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" htmlFor="c-name" className="sm:col-span-2">
            <Input id="c-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Dublin dentists Q4" />
          </Field>
          <Field label="Country (ISO-2)" htmlFor="c-cc" hint="Must have a jurisdiction policy or the gate fails closed.">
            <Input id="c-cc" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={2} placeholder="IE" />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-fg">Territory</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Geometry type">
            {(['bbox', 'circle', 'polygon', 'cities'] as GeomKind[]).map((k) => (
              <Button key={k} type="button" size="sm" variant={kind === k ? 'default' : 'outline'} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {k === 'bbox' ? 'Bounding box' : k === 'circle' ? 'Point + radius' : k === 'polygon' ? 'GeoJSON polygon' : 'City list'}
              </Button>
            ))}
          </div>
          {kind === 'bbox' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {num(bbox.minLng, (v) => setBbox({ ...bbox, minLng: v }), 'bb-minlng', 'Min lng (W)')}
              {num(bbox.minLat, (v) => setBbox({ ...bbox, minLat: v }), 'bb-minlat', 'Min lat (S)')}
              {num(bbox.maxLng, (v) => setBbox({ ...bbox, maxLng: v }), 'bb-maxlng', 'Max lng (E)')}
              {num(bbox.maxLat, (v) => setBbox({ ...bbox, maxLat: v }), 'bb-maxlat', 'Max lat (N)')}
            </div>
          )}
          {kind === 'circle' && (
            <div className="grid grid-cols-3 gap-2">
              {num(circle.lat, (v) => setCircle({ ...circle, lat: v }), 'ci-lat', 'Centre lat')}
              {num(circle.lng, (v) => setCircle({ ...circle, lng: v }), 'ci-lng', 'Centre lng')}
              {num(circle.radiusM, (v) => setCircle({ ...circle, radiusM: v }), 'ci-r', 'Radius (m)')}
            </div>
          )}
          {kind === 'polygon' && (
            <Field label="GeoJSON Polygon (or Feature)" htmlFor="poly">
              <Textarea id="poly" className="font-mono text-xs" rows={6} value={polygon} onChange={(e) => setPolygon(e.target.value)} placeholder='{"type":"Polygon","coordinates":[[[lng,lat],...]]}' />
            </Field>
          )}
          {kind === 'cities' && (
            <div className="space-y-2">
              {cities.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_90px_90px_auto] items-end gap-2">
                  <Field label={i === 0 ? 'City' : ''} htmlFor={`city-${i}`}>
                    <Input id={`city-${i}`} value={c.name} onChange={(e) => setCities(cities.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Lat' : ''} htmlFor={`city-lat-${i}`}>
                    <Input id={`city-lat-${i}`} value={c.lat} onChange={(e) => setCities(cities.map((x, j) => (j === i ? { ...x, lat: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Lng' : ''} htmlFor={`city-lng-${i}`}>
                    <Input id={`city-lng-${i}`} value={c.lng} onChange={(e) => setCities(cities.map((x, j) => (j === i ? { ...x, lng: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Radius m' : ''} htmlFor={`city-r-${i}`}>
                    <Input id={`city-r-${i}`} value={c.radiusM} onChange={(e) => setCities(cities.map((x, j) => (j === i ? { ...x, radiusM: e.target.value } : x)))} />
                  </Field>
                  <Button type="button" variant="ghost" size="sm" aria-label="Remove city" disabled={cities.length === 1} onClick={() => setCities(cities.filter((_, j) => j !== i))}>
                    ×
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setCities([...cities, { name: '', lat: '', lng: '', radiusM: '5000' }])}>
                Add city
              </Button>
            </div>
          )}
        </fieldset>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-fg">
            Place types <Badge>{types.size} selected</Badge>
          </div>
          {placeTypes.isLoading ? <Loading /> : placeTypes.data ? <PlaceTypePicker tiers={placeTypes.data.tiers} selected={types} onChange={setTypes} /> : <Note tone="warning">Could not load place types.</Note>}
          <Field label="Excluded types (comma separated, optional)" htmlFor="c-excl">
            <Input id="c-excl" value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="car_dealer, lodging" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Budget cap (USD)" htmlFor="c-budget" hint="Hard stop for Places + LLM spend.">
            <Input id="c-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label="Max leads (optional)" htmlFor="c-max">
            <Input id="c-max" inputMode="numeric" value={maxLeads} onChange={(e) => setMaxLeads(e.target.value)} />
          </Field>
          <Field label="Language override" htmlFor="c-lang" hint="Defaults to the jurisdiction language.">
            <Input id="c-lang" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
          </Field>
          <Field label="Include http_only sites" htmlFor="c-http" hint="Poor existing sites count as leads (digital gap 0.4).">
            <div className="flex h-9 items-center">
              <Switch id="c-http" checked={includeHttpOnly} onCheckedChange={setIncludeHttpOnly} label="Include http_only" />
            </div>
          </Field>
        </div>
        {error && (
          <Note tone="critical" className="text-sm">
            {error}
          </Note>
        )}
      </form>
    </Dialog>
  );
}
