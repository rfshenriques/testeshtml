import type { PricingConfig, TierName } from '@sitewright/shared-types';
import { placeTypeTier } from '@sitewright/shared-types';

export interface LineItem { label: string; oneOff: number; monthly: number }
export interface TierQuote { buildFee: number; monthly: number; lineItems: LineItem[]; pages: number; revisions: number; updatesPerMonth: number; label: string }
export interface QuoteComputation {
  currency: string;
  recommendedTier: TierName;
  tiers: Record<TierName, TierQuote>;
  multiplier: number;
  rate: number;
  reasoning: string[];
  addOns: string[];
  validDays: number;
}

export interface QuoteInputs {
  countryCode: string;
  currency: string;
  primaryType: string | null;
  reviewCount: number | null;
  score: number | null;
  /** Bottom quartile of scores in the campaign (0..1). Leads below are never quoted premium. */
  bottomQuartileScore: number;
  addOns?: string[];
  tier?: TierName;
}

const ADD_ON_LABELS: Record<keyof PricingConfig['addOns'], string> = {
  contentManagement: 'Content management', maintenance: 'Hosting + maintenance', seoLocal: 'Local SEO', copywritingExtra: 'Extra copywriting (per page)',
  ecommerce: 'E-commerce', multilingual: 'Multilingual (per language)', domainAndEmail: 'Domain + business email', photography: 'Photography (one-off)',
};

/** Tier selection rule (spec §10.1). */
export function selectTier(i: QuoteInputs): { tier: TierName; reasoning: string[] } {
  const reasoning: string[] = [];
  const typeTier = placeTypeTier(i.primaryType);
  let tier: TierName = 'business';
  if (typeTier === 'A' && (i.reviewCount ?? 0) > 50) { tier = 'premium'; reasoning.push(`Tier A vertical (${i.primaryType}) with ${i.reviewCount} reviews → premium`); }
  else if (typeTier === 'C' && (i.reviewCount ?? 0) < 10) { tier = 'starter'; reasoning.push(`Tier C vertical (${i.primaryType}) with few reviews → starter`); }
  else reasoning.push(`Default tier for ${i.primaryType ?? 'unknown type'} (tier ${typeTier ?? '-'}) → business`);
  if (tier === 'premium' && (i.score ?? 0) <= i.bottomQuartileScore) { tier = 'business'; reasoning.push('Lead scores in the bottom quartile → never quote premium (reply-rate protection)'); }
  return { tier, reasoning };
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** Price all tiers in the lead's local currency with the purchasing-power multiplier (spec §10.1). Pure. */
export function computeQuote(config: PricingConfig, i: QuoteInputs): QuoteComputation {
  const multiplier = config.countryMultipliers[i.countryCode] ?? 1;
  const rate = config.currencyRates[i.currency] ?? 1;
  const conv = (n: number, step: number) => roundTo(n * multiplier * rate, step);
  const sel = selectTier(i);
  const recommendedTier = i.tier ?? sel.tier;
  const addOns = (i.addOns ?? []).filter((a): a is keyof PricingConfig['addOns'] => a in config.addOns);
  const tiers = {} as Record<TierName, TierQuote>;
  for (const name of ['starter', 'business', 'premium'] as TierName[]) {
    const t = config.tiers[name];
    const lineItems: LineItem[] = [
      { label: `${t.label} website build (${t.pages ? `${t.pages} pages` : 'unlimited pages'}, ${t.revisions} revision round${t.revisions === 1 ? '' : 's'})`, oneOff: conv(t.buildFee, 10), monthly: 0 },
      { label: `Hosting, maintenance${t.updatesPerMonth ? ` and ${t.updatesPerMonth} content update${t.updatesPerMonth === 1 ? '' : 's'}/month` : ''}${name === 'premium' ? ', local SEO, priority support' : ''}`, oneOff: 0, monthly: conv(t.monthly, 1) },
    ];
    for (const a of addOns) {
      const def = config.addOns[a] as Record<string, number>;
      lineItems.push({ label: ADD_ON_LABELS[a], oneOff: conv((def.setup ?? 0) + (def.oneOff ?? 0) + (def.perPage ?? 0) + (def.perLanguage ?? 0), 10), monthly: conv(def.monthly ?? 0, 1) });
    }
    tiers[name] = {
      label: t.label, pages: t.pages, revisions: t.revisions, updatesPerMonth: t.updatesPerMonth,
      buildFee: lineItems.reduce((s, l) => s + l.oneOff, 0), monthly: lineItems.reduce((s, l) => s + l.monthly, 0), lineItems,
    };
  }
  const reasoning = [...sel.reasoning, `Country multiplier ${i.countryCode}: ×${multiplier}`, `Currency ${i.currency}: rate ${rate} from ${config.currency}`];
  if (i.tier) reasoning.push(`Tier forced to ${i.tier} by operator`);
  return { currency: i.currency, recommendedTier, tiers, multiplier, rate, reasoning, addOns, validDays: 14 };
}
