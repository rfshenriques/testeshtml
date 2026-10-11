/**
 * Strips quoted history and signatures from a plain-text reply so the classifier (spec §11.7)
 * sees only what the human wrote.
 */

const CUT_MARKERS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^_{3,}\s*$/, // Outlook separator
  /^Sent from my\b/i,
  /^Sent from (Outlook|Mail|Yahoo|Gmail|Samsung|Proton|my)\b/i,
  /^Get Outlook for (iOS|Android)/i,
  /^Envoyé de mon\b/i,
  /^Gesendet von meinem\b/i,
  /^Enviado desde mi\b/i,
  /^--\s?$/, // signature delimiter "-- "
  /^Le .+ a écrit\s*:\s*$/i,
  /^Am .+ schrieb .+:\s*$/i,
  /^El .+ escribió:\s*$/i,
  /^Il .+ ha scritto:\s*$/i,
  /^Em .+ escreveu:\s*$/i,
  /^Op .+ schreef .+:\s*$/i,
  /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2} .+<.+@.+>:\s*$/, // "2024-01-01 10:00 GMT+1 Name <a@b>:"
  /^On .{0,200}wrote:\s*$/i,
  /^On .{0,200}wrote\s*$/i,
];

const HEADER_BLOCK_FIRST = /^(From|Von|De|Da):\s.+/i;
const HEADER_BLOCK_FOLLOW = /^(Sent|To|Cc|Subject|Date|Gesendet|An|Betreff|Envoyé|À|Objet|Para|Asunto|Enviado):\s/i;

function isWrappedOnWrote(lines: string[], i: number): number {
  // "On Mon, 1 Jan 2024 at 10:00, Jane <jane@example.com>" + newline + "wrote:" (Gmail wraps long lines)
  if (!/^On\s/.test(lines[i])) return 0;
  for (let j = i; j < Math.min(lines.length, i + 3); j++) {
    if (/wrote:\s*$/i.test(lines[j])) return j - i + 1;
  }
  return 0;
}

function isHeaderBlock(lines: string[], i: number): boolean {
  if (!HEADER_BLOCK_FIRST.test(lines[i])) return false;
  for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
    if (HEADER_BLOCK_FOLLOW.test(lines[j])) return true;
  }
  return false;
}

export function extractReplyText(text: string): string {
  if (!text) return '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  let cut = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) continue; // quoted line
    if (isWrappedOnWrote(lines, i) || isHeaderBlock(lines, i) || CUT_MARKERS.some((re) => re.test(trimmed) || re.test(line))) {
      cut = true;
      break;
    }
    kept.push(line);
  }

  let result = tidy(kept);
  if (!result && cut) {
    // Bottom-posted reply: the marker came first. Keep everything that is not quoted or a marker line.
    const fallback = lines.filter((l) => {
      const t = l.trim();
      return !t.startsWith('>') && !CUT_MARKERS.some((re) => re.test(t)) && !HEADER_BLOCK_FIRST.test(t) && !HEADER_BLOCK_FOLLOW.test(t);
    });
    result = tidy(fallback);
  }
  return result;
}

function tidy(lines: string[]): string {
  return lines
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
