import type { ContentBrief } from '@sitewright/shared-types';

/** Copy generation prompt (spec §9.3). */
export function copySystem(languageCode: string, tone: string): string {
  return `You write website copy for small local businesses. Write in ${languageCode}. Tone: ${tone}. Never invent facts. Never state prices, awards, years in business, certifications, staff names, or claims not present in the input. Where a section detail you do not have, write copy that works without it. Output JSON only, no markdown fences.`;
}

export function copyUser(brief: ContentBrief, sections: string[]): string {
  return `Content brief (the ONLY facts you may use):
${JSON.stringify(brief, null, 2)}

Template sections to write for: ${sections.join(', ')}

Return:
{
  "meta": { "title": "<=60 chars", "description": "<=155 chars" },
  "hero": { "headline": "<=8 words", "subhead": "<=20 words", "ctaLabel": "<=3 words" },
  "about": { "heading": "", "body": "60-90 words" },
  "services": [ { "name": "", "description": "18-30 words" } ],   // 3-6 items
  "whyUs": [ { "title": "<=4 words", "body": "<=25 words" } ],    // 3 items
  "cta": { "heading": "", "body": "<=25 words", "buttonLabel": "" },
  "placeholdersUsed": ["..."]    // any element the business must supply
}`;
}

export function regenerateFieldUser(brief: ContentBrief, field: string, previous: string, violation: string): string {
  return `Content brief (the ONLY facts you may use):
${JSON.stringify(brief, null, 2)}

Rewrite ONLY the field "${field}". The previous text was rejected because it contains an unverifiable claim (${violation}):
"""${previous}"""

Return JSON: { "value": "<new text for ${field}>" }`;
}
