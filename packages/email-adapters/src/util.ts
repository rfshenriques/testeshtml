/** Parse a JSON string leniently; non-strings are returned as-is. */
export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Normalise a Message-ID / References value to the bare `<...>` tokens. */
export function splitMessageIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(splitMessageIds);
  if (typeof v !== 'string') return [];
  const matches = v.match(/<[^<>\s]+>/g);
  if (matches) return matches;
  return v
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatAddress(a: { address: string; name?: string }): string {
  if (!a.name) return a.address;
  const name = a.name.replace(/["\\]/g, '');
  return `"${name}" <${a.address}>`;
}
