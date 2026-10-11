import { randomBytes } from 'node:crypto';

const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
const NANOID_LENGTH = 21;

/** nanoid-compatible id (21 chars from the url-safe 64-char alphabet) using node:crypto. */
export function randomId(length = NANOID_LENGTH): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] & 63];
  return out;
}

/** `<nanoid@domain>` for use as a Message-ID so replies can be matched via In-Reply-To / References (spec §11.7). */
export function buildMessageId(domain: string): string {
  const d = (domain || '').trim().replace(/^@/, '').replace(/[<>\s]/g, '');
  if (!d) throw new Error('buildMessageId: domain is required');
  return `<${randomId()}@${d}>`;
}
