import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import { toast } from './toast';

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.code === 'NETWORK' ? 'Cannot reach the API' : `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        // 401 is handled by the login gate; silent polling of /health should not spam toasts.
        if (err instanceof ApiError && err.status === 401) return;
        if (query.meta?.silent) return;
        toast.error('Request failed', describe(err));
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => {
        if (err instanceof ApiError && err.status === 401) return;
        toast.error('Action failed', describe(err));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Query key namespaces. */
export const keys = {
  health: ['health'] as const,
  dashboard: ['dashboard'] as const,
  ops: ['ops'] as const,
  alerts: ['alerts'] as const,
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaigns', id] as const,
  tiles: (id: string) => ['campaigns', id, 'tiles'] as const,
  placeTypes: ['place-types'] as const,
  leads: ['leads'] as const,
  lead: (id: string) => ['leads', id] as const,
  /** Style gallery: kept outside `lead(id)` so drawer refreshes do not refetch 24 rendered variants. */
  siteVariants: (id: string) => ['site-variants', id] as const,
  siteVariant: (id: string, template: string, colourScheme: string, typography: string) => ['site-variant', id, template, colourScheme, typography] as const,
  review: ['review'] as const,
  generator: ['generator'] as const,
  outreach: ['outreach'] as const,
  inbox: ['inbox'] as const,
  pricing: ['pricing'] as const,
  compliance: ['compliance'] as const,
  tasks: ['tasks'] as const,
};
