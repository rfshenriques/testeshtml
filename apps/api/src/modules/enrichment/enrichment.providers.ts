import { Provider } from '@nestjs/common';
import { ENV, Env } from '../../shared/config/config.module';
import { CostLedgerService } from '../ops/cost-ledger.service';
import { EMAIL_VERIFIER, ENRICHMENT_ADAPTERS, EmailVerifier, EnrichmentAdapter } from './enrichment.types';

/**
 * Adapters in cost order (spec §6.4): social-profile (unavailable unless an official API exists),
 * registry (Companies House for GB; MBR placeholder for MT), directory (licensed providers only),
 * data-provider (Hunter etc., only where a domain exists), pattern-guess (parked/broken domains only).
 */
export const enrichmentAdaptersProvider: Provider = {
  provide: ENRICHMENT_ADAPTERS,
  inject: [ENV, CostLedgerService],
  useFactory: (env: Env, costs: CostLedgerService): EnrichmentAdapter[] => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@sitewright/enrichment-adapters');
    const onCost = (e: { adapter: string; units: number; usd: number }) =>
      costs.record({ category: 'enrichment', units: e.units, usd: e.usd, provider: e.adapter });
    const deps = { onCost };
    return [
      new pkg.SocialProfileAdapter({ ...deps, enabled: env.SOCIAL_PROFILE_ADAPTER_ENABLED }),
      new pkg.CompaniesHouseAdapter({ ...deps, apiKey: env.COMPANIES_HOUSE_API_KEY }),
      new pkg.MaltaMbrAdapter(deps),
      new pkg.DirectoryAdapter({ ...deps, providers: [] }),
      new pkg.DataProviderAdapter({ ...deps, provider: env.DATA_PROVIDER, apiKey: env.DATA_PROVIDER_API_KEY }),
      new pkg.PatternGuessAdapter(deps),
    ];
  },
};

export const emailVerifierProvider: Provider = {
  provide: EMAIL_VERIFIER,
  inject: [ENV, CostLedgerService],
  useFactory: (env: Env, costs: CostLedgerService): EmailVerifier => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@sitewright/enrichment-adapters');
    const onCost = (e: { adapter: string; units: number; usd: number }) =>
      costs.record({ category: 'email_verify', units: e.units, usd: e.usd, provider: e.adapter });
    const local = new pkg.LocalVerifier();
    let provider: EmailVerifier | null = null;
    switch (env.EMAIL_VERIFY_PROVIDER) {
      case 'zerobounce': provider = new pkg.ZeroBounceVerifier({ apiKey: env.EMAIL_VERIFY_API_KEY, onCost }); break;
      case 'neverbounce': provider = new pkg.NeverBounceVerifier({ apiKey: env.EMAIL_VERIFY_API_KEY, onCost }); break;
      case 'fake': provider = new pkg.FakeVerifier(); break;
      case 'local': provider = null; break;
    }
    return new pkg.ChainVerifier(local, provider);
  },
};
