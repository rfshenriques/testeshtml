/** Shared by the Styles tab and the design studio: one built variant (HTML) per lead × template × scheme × typography, cached. */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import type { ColourScheme, Typography } from '@/lib/types';

export interface StyleCombo { templateId: string; colourScheme: ColourScheme; typography: Typography }

export const sameCombo = (a: StyleCombo | null | undefined, b: StyleCombo | null | undefined) =>
  !!a && !!b && a.templateId === b.templateId && a.colourScheme === b.colourScheme && a.typography === b.typography;

export const describeCombo = (c: StyleCombo) => `${c.templateId} / ${c.colourScheme} / ${c.typography}`;

export function useVariantHtml(leadId: string, combo: StyleCombo, enabled: boolean) {
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
