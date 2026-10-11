import { describe, expect, it } from 'vitest';
import { isDisposableDomain, isSyntacticallyValidEmail, registrableDomain } from './domain';

describe('isSyntacticallyValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isSyntacticallyValidEmail('info@example.com')).toBe(true);
    expect(isSyntacticallyValidEmail('first.last+tag@sub.example.co.uk')).toBe(true);
  });
  it('rejects malformed addresses', () => {
    for (const bad of ['', 'plain', '@example.com', 'a@', 'a@b', 'a b@example.com', 'a@exa mple.com', 'a@.com', 'a@example..com', 'a..b@example.com']) {
      expect(isSyntacticallyValidEmail(bad), bad).toBe(false);
    }
  });
});

describe('isDisposableDomain', () => {
  it('flags known providers and their subdomains, not ordinary domains', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true);
    expect(isDisposableDomain('MAILINATOR.COM')).toBe(true);
    expect(isDisposableDomain('mail.yopmail.com')).toBe(true);
    expect(isDisposableDomain('gmail.com')).toBe(false);
    expect(isDisposableDomain('')).toBe(false);
  });
});

describe('registrableDomain', () => {
  it('extracts eTLD+1 from URLs, hosts and emails', () => {
    expect(registrableDomain('https://www.bella.co.uk/menu')).toBe('bella.co.uk');
    expect(registrableDomain('http://shop.example.com')).toBe('example.com');
    expect(registrableDomain('example.com')).toBe('example.com');
    expect(registrableDomain('Info@Sub.Example.ORG')).toBe('example.org');
    expect(registrableDomain('https://foo.github.io/x')).toBe('foo.github.io');
  });
  it('returns null for IPs, localhost, social hosts without domain, and garbage', () => {
    expect(registrableDomain('http://1.2.3.4/')).toBeNull();
    expect(registrableDomain('http://localhost:3000')).toBeNull();
    expect(registrableDomain('')).toBeNull();
    expect(registrableDomain('not a url')).toBeNull();
    expect(registrableDomain('http://example.invalidtld')).toBeNull();
  });
});
