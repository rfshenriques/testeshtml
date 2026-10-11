import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PricingConfigSchema, type PricingConfig, type TierName } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtMoney } from '@/lib/utils';
import { PageHeader, Section, Button, Input, Select, Field, Badge, Note, Loading, ErrorState, Table, THead, TBody, TR, TH, TD, Checkbox } from '@/components/ui';
import type { QuoteComputation } from '@/lib/types';

const TIERS: TierName[] = ['starter', 'business', 'premium'];
const ADDONS = ['contentManagement', 'maintenance', 'seoLocal', 'copywritingExtra', 'ecommerce', 'multilingual', 'domainAndEmail', 'photography'] as const;

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
      <Input type="number" step="any" value={Number.isFinite(v) ? v : ''} onChange={(e) => set(parseFloat(e.target.value))} className="tabular-nums" />
    </Field>
  );

  return (
    <>
      <PageHeader title="Pricing" description="Tiers, add-ons, country multipliers and currency rates. Quotes always present in the lead's local currency." actions={<Button loading={save.isPending} disabled={!cfg} onClick={onSave}>Save pricing</Button>} />
      {q.isLoading || !cfg ? (
        q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Loading />
      ) : (
        <div className="space-y-4">
          {errors.length > 0 && (
            <Note tone="critical">
              <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Note>
          )}
          <Section title="Base currency">
            <Field label="Currency (ISO 4217)" className="w-40">
              <Input value={cfg.currency} onChange={(e) => setCfg({ ...cfg, currency: e.target.value.toUpperCase() })} maxLength={3} />
            </Field>
          </Section>
          <Section title="Tiers" description="Tier selection is driven by revenue proxy and vertical; premium is never quoted to bottom-quartile leads.">
            <div className="grid gap-3 md:grid-cols-3">
              {TIERS.map((t) => {
                const tier = cfg.tiers[t];
                const set = (patch: Partial<typeof tier>) => setCfg({ ...cfg, tiers: { ...cfg.tiers, [t]: { ...tier, ...patch } } });
                return (
                  <fieldset key={t} className="space-y-2 rounded-md border p-3">
                    <legend className="px-1 text-sm font-semibold">{t}</legend>
                    <Field label="Label"><Input value={tier.label} onChange={(e) => set({ label: e.target.value })} /></Field>
                    {num(tier.buildFee, (n) => set({ buildFee: n }), `Build fee (${cfg.currency})`)}
                    {num(tier.monthly, (n) => set({ monthly: n }), `Monthly (${cfg.currency})`)}
                    <div className="grid grid-cols-3 gap-2">
                      {num(tier.pages, (n) => set({ pages: n }), 'Pages')}
                      {num(tier.revisions, (n) => set({ revisions: n }), 'Revisions')}
                      {num(tier.updatesPerMonth, (n) => set({ updatesPerMonth: n }), 'Updates/mo')}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </Section>
          <Section title="Add-ons">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ADDONS.map((k) => {
                const a = cfg.addOns[k] as Record<string, number>;
                return (
                  <fieldset key={k} className="space-y-2 rounded-md border p-3">
                    <legend className="px-1 text-xs font-semibold">{k}</legend>
                    {Object.keys(a).map((f) => num(a[f]!, (n) => setCfg({ ...cfg, addOns: { ...cfg.addOns, [k]: { ...a, [f]: n } } }), f))}
                  </fieldset>
                );
              })}
            </div>
          </Section>
          <div className="grid gap-4 lg:grid-cols-2">
            <RecordEditor title="Country multipliers" description="Purchasing-power adjustment by ISO-2 country. 1.0 = base." value={cfg.countryMultipliers} onChange={(v) => setCfg({ ...cfg, countryMultipliers: v })} keyPlaceholder="IE" />
            <RecordEditor title="Currency rates" description={`Units of each currency per 1 ${cfg.currency}.`} value={cfg.currencyRates} onChange={(v) => setCfg({ ...cfg, currencyRates: v })} keyPlaceholder="GBP" />
          </div>
          <Section title="Quote preview" description="Compute a quote for a lead with the SAVED config (preview runs server-side).">
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
      <Table>
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
                <Input aria-label={`${title} ${key}`} type="number" step="any" className="w-32 tabular-nums" value={val} onChange={(e) => onChange({ ...value, [key]: parseFloat(e.target.value) })} />
              </TD>
              <TD>
                <Button size="sm" variant="ghost" aria-label={`Remove ${key}`} onClick={() => { const n = { ...value }; delete n[key]; onChange(n); }}>×</Button>
              </TD>
            </TR>
          ))}
          <TR>
            <TD><Input aria-label={`New ${title} key`} className="w-24 font-mono" placeholder={keyPlaceholder} value={k} onChange={(e) => setK(e.target.value.toUpperCase())} /></TD>
            <TD><Input aria-label={`New ${title} value`} type="number" step="any" className="w-32" placeholder="1.0" value={v} onChange={(e) => setV(e.target.value)} /></TD>
            <TD>
              <Button size="sm" variant="outline" disabled={!k || !v} onClick={() => { onChange({ ...value, [k]: parseFloat(v) }); setK(''); setV(''); }}>Add</Button>
            </TD>
          </TR>
        </TBody>
      </Table>
    </Section>
  );
}

export function QuotePreviewTool({ initialLeadId = '', compact }: { initialLeadId?: string; compact?: boolean }) {
  const [leadId, setLeadId] = React.useState(initialLeadId);
  const [tier, setTier] = React.useState<TierName | ''>('');
  const [addOns, setAddOns] = React.useState<Set<string>>(new Set());
  const [result, setResult] = React.useState<QuoteComputation | null>(null);
  const preview = useMutation({ mutationFn: () => api.pricing.preview({ leadId: leadId.trim(), tier: tier || undefined, addOns: Array.from(addOns) }), onSuccess: setResult });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {!compact && (
          <Field label="Lead id" htmlFor="pp-lead">
            <Input id="pp-lead" className="w-64 font-mono text-xs" value={leadId} onChange={(e) => setLeadId(e.target.value)} />
          </Field>
        )}
        <Field label="Tier" htmlFor="pp-tier">
          <Select id="pp-tier" value={tier} onChange={(e) => setTier(e.target.value as TierName | '')}>
            <option value="">recommended</option>
            {TIERS.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {ADDONS.map((a) => (
            <Checkbox key={a} id={`pp-${a}`} label={a} checked={addOns.has(a)} onChange={(e) => { const n = new Set(addOns); e.target.checked ? n.add(a) : n.delete(a); setAddOns(n); }} />
          ))}
        </div>
        <Button variant="outline" loading={preview.isPending} disabled={!leadId.trim()} onClick={() => preview.mutate()}>
          {compact ? 'Preview quote' : 'Compute preview'}
        </Button>
      </div>
      {result && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">recommended: {result.recommendedTier}</Badge>
            <Badge variant="outline">{result.currency}</Badge>
            <Badge variant="outline">multiplier ×{result.multiplier}</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(result.tiers).map(([t, v]) => (
              <div key={t} className={`rounded-md border p-2 ${t === result.recommendedTier ? 'border-primary' : ''}`}>
                <div className="font-semibold">{t}</div>
                <div className="tabular-nums">{fmtMoney(v.buildFee, result.currency)} build · {fmtMoney(v.monthly, result.currency)}/mo</div>
                <ul className="mt-1 text-xs text-muted-fg">
                  {v.lineItems.map((l, i) => <li key={i}>{l.label}: {fmtMoney(l.oneOff, result.currency)} + {fmtMoney(l.monthly, result.currency)}/mo</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs font-medium text-muted-fg">Reasoning</div>
            <ul className="list-disc pl-4 text-xs">{result.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
