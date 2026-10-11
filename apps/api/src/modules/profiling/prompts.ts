import { CTAS, TONES, VERTICALS } from '@sitewright/shared-types';

/** Classification prompt (spec §7.1). Deterministic, low temperature, JSON only. */
export const CLASSIFY_SYSTEM = 'You classify small businesses for website generation. Respond with JSON only: no prose, no markdown fences.';

export function classifyUser(input: { name: string; types: string[]; address: string | null; summary: string | null; reviews: string[]; countryCode: string }): string {
  const reviews = input.reviews.slice(0, 5).map((r) => `- ${r.slice(0, 200).replace(/\s+/g, ' ')}`).join('\n') || '(none)';
  return `Business: ${input.name}
Google types: ${input.types.join(', ') || '(none)'}
Address: ${input.address ?? '(unknown)'}
Country: ${input.countryCode}
Editorial summary: ${input.summary ?? '(none)'}
Review excerpts:
${reviews}

Return:
{
  "vertical": "<one of: ${VERTICALS.join('|')}>",
  "subVertical": "<free text, 1-4 words>",
  "servicesOffered": ["..."],        // max 8, inferred, only if well-supported
  "differentiators": ["..."],        // max 4, drawn from review themes
  "toneOfVoice": "<${TONES.join('|')}>",
  "primaryCTA": "<${CTAS.join('|')}>",
  "languageCode": "<BCP-47>",
  "confidence": 0.0-1.0,
  "insufficientData": true|false
}`;
}
