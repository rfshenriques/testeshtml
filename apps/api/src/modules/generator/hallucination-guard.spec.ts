import { checkCopy, findViolations, neutralFor } from './hallucination-guard';

const facts = ['Business name: Valletta Dental', 'Google rating 4.6 from 60 reviews', 'Located in Valletta'];

describe('hallucination guard (spec §9.3)', () => {
  it.each([
    ['Over 20 years of experience', 'years-in-business'],
    ['An award-winning team', 'award'],
    ['Fully certified dentists', 'certified'],
    ['Licensed and insured', 'licensed'],
    ['Voted best dentist', 'voted'],
    ['The number one choice', 'number-one'],
    ['Serving Valletta since 1998', 'since-year'],
    ['A family-run practice', 'family-run'],
    ['Check-ups from €40', 'price'],
    ['Satisfaction guaranteed', 'guarantee'],
    ['Over 5,000 happy patients', 'customer-count'],
    ['Top-rated in Malta', 'superlative-rank'],
  ])('flags "%s" as %s', (text, pattern) => {
    const v = findViolations('hero.headline', text, facts);
    expect(v.map((x) => x.pattern)).toContain(pattern);
  });
  it('allows claims present in the source facts', () => {
    expect(findViolations('about.body', 'Rated 4.6 from 60 reviews on Google', facts)).toEqual([]);
    expect(findViolations('about.body', 'A family-run practice', [...facts, 'Editorial: a family-run practice in Valletta'])).toEqual([]);
    expect(findViolations('about.body', 'Over 60 reviews', facts)).toEqual([]);
  });
  it('flags staff names that are not in the source', () => {
    const v = checkCopy({ about: { body: 'Dr Maria Borg leads the team.' } }, facts);
    expect(v[0].pattern).toBe('staff-name');
    expect(checkCopy({ about: { body: 'Dr Maria Borg leads the team.' } }, [...facts, 'Owner: Maria Borg'])).toEqual([]);
  });
  it('walks nested copy and reports dotted paths', () => {
    const v = checkCopy({ services: [{ name: 'Whitening', description: 'Guaranteed results' }], placeholdersUsed: ['award winning'] }, facts);
    expect(v).toEqual([{ field: 'services.0.description', pattern: 'guarantee', match: 'Guaranteed' }]);
  });
  it('neutral fallbacks are generic and substitute business/city', () => {
    expect(neutralFor('hero.headline', { business: 'X', city: 'Valletta' })).toBe('Welcome to X');
    expect(neutralFor('services.2.description', { business: 'X', city: '' })).toBe('Ask us about this service.');
  });
});
