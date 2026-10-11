import { looksLikeSoleTrader } from './sole-trader';

describe('looksLikeSoleTrader (conservative)', () => {
  it.each([
    ['Maria Borg', 3], ['John Smith Plumbing', 10], ["John's Plumbing", 2], ['Dr Anna Vella', 12], ['J. Camilleri Electrical', 0], ['Sarah', 1],
  ])('treats "%s" (%i reviews) as a sole trader', (name, reviews) => {
    expect(looksLikeSoleTrader(name, reviews).soleTrader).toBe(true);
  });
  it.each([
    ['Valletta Dental Clinic Ltd', 3], ['Borg & Sons Limited', 2], ['Smith Plumbing GmbH', 0], ['Acme Corp', 1], ['Blue Lagoon Restaurant', 5], ['The Hair Studio', 2], ['Maria Borg', 80],
  ])('does not treat "%s" (%i reviews) as a sole trader', (name, reviews) => {
    expect(looksLikeSoleTrader(name, reviews).soleTrader).toBe(false);
  });
  it('blocks on an empty name', () => {
    expect(looksLikeSoleTrader('   ', 10).soleTrader).toBe(true);
  });
});
