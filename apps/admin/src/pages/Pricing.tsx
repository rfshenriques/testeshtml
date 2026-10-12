import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { PricingConfigSchema, type PricingConfig, type TierName } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtMoney, titleCase } from '@/lib/utils';
import { PageHeader, Section, Button, Input, Select, Field, Note, Loading, ErrorState, Table, THead, TBody, TR, TH, TD, Checkbox } from '@/components/ui';
import type { QuoteComputation } from '@/lib/types';

const TIERS: TierName[] = ['starter', 'business', 'premium'];
const ADDONS = ['contentManagement', 'maintenance', 'seoLocal', 'copywritingExtra', 'ecommerce', 'multilingual', 'domainAndEmail', 'photography', 'nfcTagExtra'] as const;
/** Add-ons the quote engine accepts repeated in `addOns` (one entry per unit). */
const QUANTITY_ADDONS: Record<string, { label: string; unit: string }> = { nfcTagExtra: { label: 'Extra NFC tags', unit: 'tag' } };
const ADDON_HINT: Partial<Record<(typeof ADDONS)[number], string>> = { nfcTagExtra: 'Google review + website NFC tags beyond the ones included in the tier; `perTag` one-off.' };

const humanise = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

export function PricingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.pricing, queryFn: api.pricing.get });
  const [cfg, setCfg] = React.useState<PricingConfig | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (q.data) setCfg(structuredClone(q.data));
  }, [q.data]);
  const save = useMutation({ mutationFn: (c: PricingConfig) => api.pricing.save(c), onSuccess: () => { toast.success('Pricing saved', 'Applies to new quotes only; existing quotes keep their figures.'); void qc.invalidateQueries({ queryKey: keys.pricing }); } });

  const onSave = () => {
    if (!cfg) return;
    const r = PricingConfigSchema.safeParse(cfg);
    if (!r.success) return setErrors(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    setErrors([]);
    save.mutate(r.data);
  };
  const num = (v: number, set: (n: number) => void, label: string) => (
    <Field label={label}>
      <Input type="number" step="any" value={Number.isFinite(v) ? v : ''} onChange={(e) => set(parseFloat(e.target.value))} />
    </Field>
  );
  const int = (v: number, set: (n: number) => void, label: string, id?: string) => (
    <Field label={label} htmlFor={id}>
      <Input id={id} type="number" step={1} min={0} inputMode="numeric" value={Number.isFinite(v) ? v : ''} onChange={(e) => set(Math.max(0, Math.floor(parseInt(e.target.value, 10) || 0)))} />
    </Field>
  );

  return (
    <>
      <PageHeader title="Pricing" description="Tiers, add-ons, country multipliers and currency rates. Quotes present in the lead's local currency." actions={<Button loading={save.isPending} disabled={!cfg} onClick={onSave}>Save pricing</Button>} />
      {q.isLoading || !cfg ? (
        q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Loading rows={6} />
      ) : (
        <div className="space-y-6">
          {errors.length > 0 && (
            <Note tone="critical">
              <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Note>
          )}
          <Section title="Tiers" description="Tier selection is driven by revenue proxy and vertical; premium is never quoted to bottom-quartile leads." actions={
            <Field label="Base currency" className="flex-row items-center gap-2">
              <Input aria-label="Base currency (ISO 4217)" className="w-20 uppercase" value={cfg.currency} onChange={(e) => setCfg({ ...cfg, currency: e.target.value.toUpperCase() })} maxLength={3} />
            </Field>
          }>
            <div className="grid gap-6 md:grid-cols-3 md:divide-x">
              {TIERS.map((t) => {
                const tier = cfg.tiers[t];
                const set = (patch: Partial<typeof tier>) => setCfg({ ...cfg, tiers: { ...cfg.tiers, [t]: { ...tier, ...patch } } });
                return (
                  <fieldset key={t} className="space-y-3 md:pr-6 md:not-first:pl-6 md:last:pr-0">
                    <legend className="mb-3 text-base font-semibold">{titleCase(t)}</legend>
                    <Field label="Label"><Input value={tier.label} onChange={(e) => set({ label: e.target.value })} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      {num(tier.buildFee, (n) => set({ buildFee: n }), `Build fee (${cfg.currency})`)}
                      {num(tier.monthly, (n) => set({ monthly: n }), `Monthly (${cfg.currency})`)}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {num(tier.pages, (n) => set({ pages: n }), 'Pages')}
                      {num(tier.revisions, (n) => set({ revisions: n }), 'Revisions')}
                      {num(tier.updatesPerMonth, (n) => set({ updatesPerMonth: n }), 'Updates/mo')}
                    </div>
                    {int(tier.nfcTags ?? 0, (n) => set({ nfcTags: n }), 'NFC tags included (Google review + website)', `tier-${t}-nfc`)}
                  </fieldset>
                );
              })}
            </div>
          </Section>
          <Section title="Add-ons">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {ADDONS.map((k) => {
                const a = ((cfg.addOns as Record<string, Record<string, number> | undefined>)[k] ?? (k === 'nfcTagExtra' ? { perTag: 15 } : {})) as Record<string, number>;
                return (
                  <fieldset key={k} className="rounded-md border p-4">
                    <legend className="px-1 text-sm font-semibold">{humanise(k)}</legend>
                    <div className={cn('grid gap-3', Object.keys(a).length > 1 && 'grid-cols-2')}>
                      {Object.keys(a).map((f) => num(a[f]!, (n) => setCfg({ ...cfg, addOns: { ...cfg.addOns, [k]: { ...a, [f]: n } } }), humanise(f)))}
                    </div>
                    {ADDON_HINT[k] && <p className="mt-2 text-sm text-muted-fg">{ADDON_HINT[k]}</p>}
                  </fieldset>
                );
              })}
            </div>
          </Section>
          <div className="grid gap-6 lg:grid-cols-2">
            <RecordEditor title="Country multipliers" description="Purchasing-power adjustment by ISO-2 country. 1.0 = base." value={cfg.countryMultipliers} onChange={(v) => setCfg({ ...cfg, countryMultipliers: v })} keyPlaceholder="IE" />
            <RecordEditor title="Currency rates" description={`Units of each currency per 1 ${cfg.currency}.`} value={cfg.currencyRates} onChange={(v) => setCfg({ ...cfg, currencyRates: v })} keyPlaceholder="GBP" />
          </div>
          <Section title="Quote preview" description="Compute a quote for a lead with the saved config (runs server-side).">
            <QuotePreviewTool />
          </Section>
        </div>
      )}
    </>
  );
}

function RecordEditor({ title, description, value, onChange, keyPlaceholder }: { title: string; description: string; value: Record<string, number>; onChange: (v: Record<string, number>) => void; keyPlaceholder: string }) {
  const [k, setK] = React.useState('');
  const [v, setV] = React.useState('');
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Section title={title} description={description}>
      <Table bare>
        <THead>
          <tr>
            <TH>Key</TH>
            <TH>Value</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {entries.map(([key, val]) => (
            <TR key={key}>
              <TD className="font-mono">{key}</TD>
              <TD>
                <Input aria-label={`${title} ${key}`} type="number" step="any" className="h-8 w-32 text-sm" value={val} onChange={(e) => onChange({ ...value, [key]: parseFloat(e.target.value) })} />
              </TD>
              <TD className="text-right">
                <Button size="iconSm" variant="ghost" className="text-muted-fg" aria-label={`Remove ${key}`} onClick={() => { const n = { ...value }; delete n[key]; onChange(n); }}>
                  <X className="size-4" aria-hidden />
                </Button>
              </TD>
            </TR>
          ))}
          <TR className="hover:bg-transparent">
            <TD><Input aria-label={`New ${title} key`} className="h-8 w-24 font-mono text-sm uppercase" placeholder={keyPlaceholder} value={k} onChange={(e) => setK(e.target.value.toUpperCase())} /></TD>
            <TD><Input aria-label={`New ${title} value`} type="number" step="any" className="h-8 w-32 text-sm" placeholder="1.0" value={v} onChange={(e) => setV(e.target.value)} /></TD>
            <TD className="text-right">
              <Button size="sm" variant="outline" disabled={!k || !v} onClick={() => { onChange({ ...value, [k]: parseFloat(v) }); setK(''); setV(''); }}>Add</Button>
            </TD>
          </TR>
        </TBody>
      </Table>
    </Section>
  );
}

/** Flat add-on list for the quote engine: boolean add-ons once, quantity add-ons repeated once per unit (`['nfcTagExtra','nfcTagExtra']` = 2 extra tags). */
export function buildAddOns(flags: Set<string>, quantities: Record<string, number>): string[] {
  const out = Array.from(flags).filter((a) => !QUANTITY_ADDONS[a]);
  for (const [key, qty] of Object.entries(quantities)) for (let i = 0; i < Math.max(0, Math.floor(qty)); i++) out.push(key);
  return out;
}

export function QuotePreviewTool({ initialLeadId = '', compact }: { initialLeadId?: string; compact?: boolean }) {
  const [leadId, setLeadId] = React.useState(initialLeadId);
  const [tier, setTier] = React.useState<TierName | ''>('');
  const [addOns, setAddOns] = React.useState<Set<string>>(new Set());
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [result, setResult] = React.useState<QuoteComputation | null>(null);
  const preview = useMutation({ mutationFn: () => api.pricing.preview({ leadId: leadId.trim(), tier: tier || undefined, addOns: buildAddOns(addOns, quantities) }), onSuccess: setResult });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {!compact && (
          <Field label="Lead id" htmlFor="pp-lead">
            <Input id="pp-lead" className="w-64 font-mono text-sm" value={leadId} onChange={(e) => setLeadId(e.target.value)} />
          </Field>
        )}
        <Field label="Tier" htmlFor="pp-tier">
          <Select id="pp-tier" className="w-44" value={tier} onChange={(e) => setTier(e.target.value as TierName | '')}>
            <option value="">recommended</option>
            {TIERS.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        {ADDONS.filter((a) => QUANTITY_ADDONS[a]).map((a) => (
          <Field key={a} label={`${QUANTITY_ADDONS[a]!.label} (qty)`} htmlFor={`pp-${a}-qty`} className="w-36">
            <Input id={`pp-${a}-qty`} type="number" min={0} step={1} inputMode="numeric" value={quantities[a] ?? 0} onChange={(e) => setQuantities({ ...quantities, [a]: Math.max(0, Math.floor(parseInt(e.target.value, 10) || 0)) })} />
          </Field>
        ))}
        <Button variant="outline" loading={preview.isPending} disabled={!leadId.trim()} onClick={() => preview.mutate()}>
          {compact ? 'Preview quote' : 'Compute preview'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {ADDONS.filter((a) => !QUANTITY_ADDONS[a]).map((a) => (
          <Checkbox key={a} id={`pp-${a}`} label={<span className="text-sm">{a}</span>} checked={addOns.has(a)} onChange={(e) => { const n = new Set(addOns); e.target.checked ? n.add(a) : n.delete(a); setAddOns(n); }} />
        ))}
      </div>
      {result && (
        <div className="space-y-4 border-t pt-4">
          <div className="text-sm text-muted-fg">
            Recommended: <span className="font-medium text-fg">{result.recommendedTier}</span> · {result.currency} · multiplier ×{result.multiplier}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(result.tiers).map(([t, v]) => (
              <div key={t} className={cn('rounded-lg border p-4', t === result.recommendedTier && 'border-primary bg-[color-mix(in_oklab,var(--primary)_5%,transparent)]')}>
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{titleCase(t)}</div>
                  {t === result.recommendedTier && <span className="text-xs font-medium text-primary">Recommended</span>}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{fmtMoney(v.buildFee, result.currency)}</div>
                <div className="text-sm text-muted-fg tabular-nums">+ {fmtMoney(v.monthly, result.currency)}/mo</div>
                <ul className="mt-3 space-y-1 border-t pt-3 text-sm text-muted-fg">
                  {v.lineItems.map((l, i) => <li key={i}>{l.label}: {fmtMoney(l.oneOff, result.currency)} + {fmtMoney(l.monthly, result.currency)}/mo</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div>
            <div className="t-label mb-1">Reasoning</div>
            <ul className="list-disc pl-4 text-sm">{result.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
