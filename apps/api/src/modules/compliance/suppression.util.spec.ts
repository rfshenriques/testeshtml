import { hashEmail, normaliseDomain, normaliseEmail, PUBLIC_EMAIL_DOMAINS } from './suppression.util';

describe('suppression utils', () => {
  it('hashes the lowercased, trimmed email with sha256', () => {
    expect(hashEmail('  Info@Example.COM ')).toBe(hashEmail('info@example.com'));
    expect(hashEmail('info@example.com')).toMatch(/^[a-f0-9]{64}$/);
    expect(normaliseEmail(' A@B.c ')).toBe('a@b.c');
  });
  it('normalises domains to the registrable domain', () => {
    expect(normaliseDomain('https://www.Shop.Example.co.uk/path')).toBe('example.co.uk');
    expect(normaliseDomain('info@mail.example.com')).toBe('example.com');
    expect(normaliseDomain('localhost')).toBeNull();
    expect(normaliseDomain('127.0.0.1')).toBeNull();
    expect(normaliseDomain('')).toBeNull();
  });
  it('knows public mailbox providers', () => {
    expect(PUBLIC_EMAIL_DOMAINS.has('gmail.com')).toBe(true);
  });
});
