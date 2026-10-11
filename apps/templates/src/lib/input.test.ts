import { describe, expect, it } from 'vitest';
import { sampleInput } from '../fixtures/sample-input';
import { copyText, formatDate, isPlaceholder, jsonForScript, localBusinessJsonLd, priceLevelLabel, telHref } from './input';

describe('placeholders', () => {
  const copy = { ...sampleInput('retail').copy, placeholdersUsed: ['about.body', 'services[2]', 'whyUs', 'ctaLabel'] };
  it('matches exact paths, parent paths and bare leaf names', () => {
    expect(isPlaceholder(copy, 'about.body')).toBe(true);
    expect(isPlaceholder(copy, 'about.heading')).toBe(false);
    expect(isPlaceholder(copy, 'services[2].description')).toBe(true);
    expect(isPlaceholder(copy, 'services[1].description')).toBe(false);
    expect(isPlaceholder(copy, 'whyUs[0].title')).toBe(true);
    expect(isPlaceholder(copy, 'hero.ctaLabel')).toBe(true);
    expect(isPlaceholder(copy, 'hero.headline')).toBe(false);
  });
  it('renders a neutral placeholder instead of the value, and for empty strings', () => {
    expect(copyText(copy, 'about.body', 'real text')).toEqual({ text: 'To be supplied by the business', placeholder: true });
    expect(copyText(copy, 'hero.headline', '   ')).toEqual({ text: 'To be supplied by the business', placeholder: true });
    expect(copyText(copy, 'hero.headline', 'Hello')).toEqual({ text: 'Hello', placeholder: false });
  });
});

describe('formatting helpers', () => {
  it('formats dates deterministically in UTC without locale calls', () => {
    expect(formatDate('2026-11-10T23:59:00.000Z')).toEqual({ human: '10 November 2026', iso: '2026-11-10' });
    expect(formatDate('not a date')).toEqual({ human: 'not a date', iso: 'not a date' });
  });
  it('builds tel: links from the international number first', () => {
    expect(telHref('0117 496 0123', '+44 117 496 0123')).toBe('tel:+441174960123');
    expect(telHref('0117 496 0123', null)).toBe('tel:01174960123');
    expect(telHref(null, null)).toBeNull();
  });
  it('renders price levels neutrally', () => {
    expect(priceLevelLabel(null)).toBeNull();
    expect(priceLevelLabel(0)).toBeNull();
    expect(priceLevelLabel(3)).toBe('€€€');
  });
  it('escapes JSON for inline scripts', () => {
    expect(jsonForScript({ a: '</script>' })).toBe('{"a":"\\u003c/script>"}');
  });
});

describe('LocalBusiness JSON-LD', () => {
  it('includes only facts from the brief', () => {
    const input = sampleInput('hospitality');
    const ld = localBusinessJsonLd(input) as Record<string, any>;
    expect(ld['@type']).toBe('LocalBusiness');
    expect(ld.additionalType).toBe('https://schema.org/CafeOrCoffeeShop');
    expect(ld.telephone).toBe('+44 117 496 0123');
    expect(ld.openingHours[0]).toBe('Monday 7:30 AM – 4:00 PM');
    expect(ld.geo.latitude).toBe(51.4545);
    expect(ld.aggregateRating.reviewCount).toBe(212);
  });
  it('omits geo, telephone and rating when the brief lacks them', () => {
    const input = sampleInput('trades');
    input.brief.lat = null; input.brief.lng = null; input.brief.phone = null; input.brief.internationalPhone = null; input.brief.rating = null;
    const ld = localBusinessJsonLd(input) as Record<string, unknown>;
    expect(ld.geo).toBeUndefined();
    expect(ld.telephone).toBeUndefined();
    expect(ld.aggregateRating).toBeUndefined();
  });
});
