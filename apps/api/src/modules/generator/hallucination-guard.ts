/**
 * Hallucination guard (spec §9.3): every generated string is checked against a deny-list of
 * unverifiable claim patterns. A claim is allowed only if it appears in the source facts.
 */
export interface Violation { field: string; pattern: string; match: string }

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'years-in-business', re: /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\+?\s*(years?|yrs|decades?)\b/i },
  { name: 'award', re: /\baward(?:s|ed|-winning)?\b/i },
  { name: 'certified', re: /\bcertif(?:ied|ication|icate)s?\b/i },
  { name: 'licensed', re: /\blicen[sc]ed\b/i },
  { name: 'voted', re: /\bvoted\b/i },
  { name: 'number-one', re: /\b(number one|no\.?\s?1|#1|the best in|best in (town|the city|the area|[A-Z][a-z]+))\b/i },
  { name: 'since-year', re: /\b(since|est\.?|established|founded)\s*(in\s*)?(19|20)\d{2}\b/i },
  { name: 'family-run', re: /\bfamily[- ](run|owned|business)\b/i },
  { name: 'price', re: /(?:[€$£]\s?\d|\d+\s?(?:€|eur|usd|gbp|dollars|euros|pounds)\b|\bfrom\s+\d+\b|\bonly\s+\d+\b)/i },
  { name: 'guarantee', re: /\bguarantee[ds]?\b/i },
  { name: 'accredited', re: /\baccredit(?:ed|ation)\b/i },
  { name: 'superlative-rank', re: /\b(top[- ]rated|highest[- ]rated|most trusted|leading)\b/i },
  { name: 'customer-count', re: /\b\d{2,}(?:,\d{3})*\+?\s*(happy |satisfied )?(customers|clients|patients|members)\b/i },
];

export function findViolations(field: string, text: string, sourceFacts: string[], extraAllowed: string[] = []): Violation[] {
  const out: Violation[] = [];
  const corpus = [...sourceFacts, ...extraAllowed].join('\n').toLowerCase();
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    const match = m[0];
    // Allowed when the exact matched phrase (or the number in it) appears in the verified source facts.
    if (corpus.includes(match.toLowerCase())) continue;
    if (p.name === 'customer-count' || p.name === 'years-in-business') {
      const num = match.match(/\d+/)?.[0];
      if (num && corpus.includes(num)) continue;
    }
    out.push({ field, pattern: p.name, match });
  }
  return out;
}

/** Staff names not in the source: any "Dr/Mr/Ms X" or "— Name" style attribution not present in facts. */
export function findStaffNames(field: string, text: string, sourceFacts: string[]): Violation[] {
  const corpus = sourceFacts.join('\n').toLowerCase();
  const out: Violation[] = [];
  for (const m of text.matchAll(/\b(Dr|Doctor|Mr|Mrs|Ms|Prof)\.?\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g)) {
    if (!corpus.includes(m[2].toLowerCase())) out.push({ field, pattern: 'staff-name', match: m[0] });
  }
  return out;
}

/** Walk every string in the copy object and collect violations keyed by dotted path. */
export function checkCopy(copy: unknown, sourceFacts: string[], extraAllowed: string[] = []): Violation[] {
  const out: Violation[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      if (path.endsWith('placeholdersUsed') || path.includes('placeholdersUsed.')) return;
      out.push(...findViolations(path, node, sourceFacts, extraAllowed), ...findStaffNames(path, node, sourceFacts));
    } else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}.${i}`));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(copy, '');
  return out;
}

/** Neutral fallbacks used after a second failure (spec §9.3). */
export const NEUTRAL_FALLBACKS: Record<string, string> = {
  'meta.title': '{business} — {city}',
  'meta.description': '{business} in {city}. Get in touch to find out more.',
  'hero.headline': 'Welcome to {business}',
  'hero.subhead': 'Serving {city} and the surrounding area.',
  'hero.ctaLabel': 'Get in touch',
  'about.heading': 'About us',
  'about.body': '{business} is based in {city}. We would be happy to tell you more about what we do and how we can help. Contact us to find out more.',
  'cta.heading': 'Get in touch',
  'cta.body': 'Contact {business} today.',
  'cta.buttonLabel': 'Contact us',
  'services.*.description': 'Ask us about this service.',
  'whyUs.*.body': 'Talk to us to find out more.',
  'services.*.name': 'Our services',
  'whyUs.*.title': 'Why choose us',
};

export function neutralFor(path: string, vars: { business: string; city: string }): string {
  const generic = path.replace(/\.\d+\./, '.*.');
  const tpl = NEUTRAL_FALLBACKS[generic] ?? NEUTRAL_FALLBACKS[path] ?? 'Contact us to find out more.';
  return tpl.replace('{business}', vars.business).replace('{city}', vars.city || 'your area');
}

export function setPath(obj: any, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}
export function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
