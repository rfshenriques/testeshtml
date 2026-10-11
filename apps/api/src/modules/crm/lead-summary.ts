import { Prisma } from '@sitewright/db';

/** Shared LeadSummary projection (docs/API.md). */
export const leadSummarySelect = {
  id: true, campaignId: true, placeId: true, businessName: true, primaryType: true, vertical: true, countryCode: true, city: true, phone: true,
  websiteStatus: true, websiteUrl: true, rating: true, reviewCount: true, score: true, stage: true, legalGate: true, legalGateReason: true,
  fallbackChannel: true, priority: true, lastTouchAt: true, createdAt: true,
  contacts: { where: { isPrimary: true }, select: { email: true, verification: true, source: true }, take: 1 },
  site: { select: { previewUrl: true, takenDownAt: true, expiresAt: true } },
  quote: { select: { slug: true } },
} satisfies Prisma.LeadSelect;

export type LeadSummaryRow = Prisma.LeadGetPayload<{ select: typeof leadSummarySelect }>;

export function toLeadSummary(row: LeadSummaryRow, quoteHost = process.env.QUOTE_HOST ?? '') {
  const { contacts, site, quote, ...rest } = row;
  return {
    ...rest,
    primaryContact: contacts[0] ?? null,
    previewUrl: site && !site.takenDownAt && site.expiresAt > new Date() ? site.previewUrl : null,
    quoteUrl: quote ? `${quoteHost}/${quote.slug}` : null,
  };
}
