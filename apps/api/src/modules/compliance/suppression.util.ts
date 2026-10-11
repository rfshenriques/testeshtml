import { createHash } from 'node:crypto';
import psl from 'psl';

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(normaliseEmail(email)).digest('hex');
}

/** Registrable domain (eTLD+1), lowercased. Returns null for bare hostnames / IPs / invalid. */
export function normaliseDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  if (host.includes('@')) host = host.split('@').pop()!;
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parsed = psl.parse(host);
  if ('error' in parsed || !parsed.domain) return null;
  return parsed.domain;
}

/** Public mailbox providers: a suppression on these domains must never be created (it would block everyone). */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com', 'yandex.com', 'ymail.com', 'msn.com', 'libero.it', 'orange.fr', 'wanadoo.fr', 'free.fr', 'btinternet.com', 'sky.com', 'virginmedia.com', 'telenet.be', 'ziggo.nl', 'kpnmail.nl', 'go.com.mt', 'maltanet.net', 'onvol.net',
]);
