import type { ScoreBreakdown } from '@sitewright/shared-types';

export interface StepCopyInput {
  businessName: string; city: string | null; vertical: string | null; primaryType: string | null; countryCode: string;
  breakdown: ScoreBreakdown | null; websiteStatus: string; rating: number | null; reviewCount: number | null;
  previewUrl: string; quoteUrl: string | null; expiresAt: Date; agencyName: string; senderName: string; languageCode: string;
  /** Hosted booking page for a short call with the operator (signed per lead). */
  bookingUrl?: string | null;
}
export interface StepCopy { subject: string; text: string }

const nice = (t: string | null) => (t ?? 'business').replace(/_/g, ' ');
const plural = (n: number, s: string) => (n === 1 ? s : `${s}s`);

/**
 * Deterministic, verifiable personalisation (spec §11.6): the hook is derived from our own
 * competitivePressure and qualitySignal data, never from an LLM's imagination. Plain text.
 */
export function stepCopy(step: 'opener' | 'nudge' | 'quote' | 'closeout' | 'bridge', i: StepCopyInput): StepCopy {
  const type = nice(i.vertical ?? i.primaryType);
  const area = i.city ?? 'your area';
  const cp = i.breakdown?.inputs?.competitivePressureShare as number | undefined;
  const same = (i.breakdown?.inputs as any)?.sameTypeInTile as number | undefined;
  const hasHook = cp != null && cp > 0;
  const hook = hasHook
    ? `I noticed ${i.businessName} is one of the few ${type} businesses in ${area} without a website: around ${Math.round(cp * 100)}% of the ${type}s nearby already have one.`
    : i.websiteStatus === 'social_only'
      ? `I noticed ${i.businessName} in ${area} runs on a social profile without a website of its own.`
      : `I noticed ${i.businessName} in ${area} doesn't have a website yet.`;
  const quality = i.rating != null && (i.reviewCount ?? 0) >= 20 ? ` With ${i.rating} stars from ${i.reviewCount} Google reviews, the reputation is already there; it just isn't findable outside Google Maps.` : '';
  const expiry = i.expiresAt.toISOString().slice(0, 10);
  const sign = `\n\n${i.senderName}\n${i.agencyName}`;
  const book = i.bookingUrl ? `\n\nIf a quick call is easier, pick a time that suits you (15 minutes, no obligation):\n${i.bookingUrl}` : '';
  switch (step) {
    case 'opener':
      return {
        subject: `${type} in ${area.toLowerCase()} without a website`.replace(/\s+/g, ' ').slice(0, 60),
        text: `Hi,\n\n${hook}${quality}\n\nRather than describe what a site could look like, I built a concept mockup for ${i.businessName} (nothing is published or indexed; it's a private preview, and you can delete it with one click):\n${i.previewUrl}\n\nIf it's useful, I can send over what building and maintaining it would cost. If not, no reply needed and the mockup comes down on ${expiry}.${book}${sign}`,
      };
    case 'nudge':
      return {
        subject: `the ${type} mockup for ${i.businessName.toLowerCase()}`.slice(0, 60),
        text: `Hi,\n\nShort follow-up on the concept mockup I built for ${i.businessName}:\n${i.previewUrl}\n\n${hasHook && same ? `There are ${same} ${plural(same, type)} listed in ${area}; most are already findable online and ${i.businessName} isn't yet.` : `It takes two minutes to look through on a phone.`}\n\nHappy to adjust anything you don't like.${sign}`,
      };
    case 'quote':
      return {
        subject: `what the website would cost`,
        text: `Hi,\n\nHere's what it would cost to build, host and maintain the site for ${i.businessName}, with no obligation:\n${i.quoteUrl ?? i.previewUrl}\n\nEverything is itemised (one-off build, monthly hosting and content updates), and you can accept online or book a call first.${book}${sign}`,
      };
    case 'closeout':
      return {
        subject: `taking the mockup down`,
        text: `Hi,\n\nI'll take you off my list; the mockup for ${i.businessName} comes down on ${expiry}. If you'd ever like it back, just reply.${sign}`,
      };
    case 'bridge':
      return {
        subject: `saw you opened the mockup`,
        text: `Hi,\n\nI saw the mockup for ${i.businessName} was opened, so I wanted to check: is there anything you'd change? The layout, colours and copy are all adjustable, and the photos are placeholders until we use yours.\n${i.previewUrl}${book}${sign}`,
      };
  }
}
