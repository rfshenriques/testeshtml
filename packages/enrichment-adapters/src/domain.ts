import psl from 'psl';
import { DISPOSABLE_DOMAINS } from './disposable-domains';

// RFC 5321/5322-ish: dot-atom local part, hostname labels, alphabetic TLD of 2+ chars.
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function isSyntacticallyValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length === 0 || e.length > 254) return false;
  const at = e.lastIndexOf('@');
  if (at <= 0 || at > 64) return false;
  return EMAIL_RE.test(e);
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const d = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  return d.length > 0 ? d : null;
}

/** True when the domain, or its registrable parent, is a known disposable-mail provider. */
export function isDisposableDomain(domain: string): boolean {
  const d = (domain || '').trim().toLowerCase().replace(/\.$/, '');
  if (!d) return false;
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  const reg = psl.get(d);
  return reg !== null && reg !== d && DISPOSABLE_DOMAINS.has(reg);
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Registrable (eTLD+1) domain of a URL, bare host or email address via the public suffix list; null for IPs/localhost/invalid. */
export function registrableDomain(urlOrEmail: string): string | null {
  if (typeof urlOrEmail !== 'string') return null;
  const input = urlOrEmail.trim();
  if (!input) return null;

  let host: string | null = null;
  if (input.includes('@') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    host = emailDomain(input);
  } else {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    try {
      host = new URL(withScheme).hostname;
    } catch {
      return null;
    }
  }
  if (!host) return null;
  host = host.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || IPV4_RE.test(host) || !host.includes('.')) return null;
  if (!psl.isValid(host)) return null;
  const reg = psl.get(host);
  return reg ? reg.toLowerCase() : null;
}
