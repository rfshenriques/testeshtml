/** Placeholder pricing (spec §10.1 DECISION). The operator must supply real price points. */
export const DEFAULT_PRICING = {
  currency: 'EUR',
  tiers: {
    starter: { buildFee: 690, monthly: 49, pages: 5, revisions: 1, updatesPerMonth: 0, label: 'Starter', nfcTags: 0 },
    business: { buildFee: 1450, monthly: 99, pages: 10, revisions: 2, updatesPerMonth: 2, label: 'Business', nfcTags: 1 },
    premium: { buildFee: 2900, monthly: 189, pages: 0, revisions: 3, updatesPerMonth: 4, label: 'Premium', nfcTags: 2 },
  },
  addOns: {
    contentManagement: { monthly: 39, updatesIncluded: 2 },
    maintenance: { monthly: 29 },
    seoLocal: { setup: 290, monthly: 79 },
    copywritingExtra: { perPage: 90 },
    ecommerce: { setup: 890, monthly: 49 },
    multilingual: { perLanguage: 350, monthly: 19 },
    domainAndEmail: { setup: 60, monthly: 9 },
    photography: { oneOff: 450 },
    nfcTagExtra: { perTag: 15 },
  },
  countryMultipliers: {
    MT: 1.0, IE: 1.15, NL: 1.15, SE: 1.1, DK: 1.2, FI: 1.1, NO: 1.3, FR: 1.1, BE: 1.1, LU: 1.3, PT: 0.8,
    DE: 1.15, IT: 0.95, AT: 1.15, ES: 0.9, PL: 0.7, GB: 1.1, US: 1.2, CA: 1.1, AU: 1.15, ZA: 0.55, NG: 0.3,
  },
  currencyRates: { EUR: 1, GBP: 0.86, USD: 1.08, CAD: 1.48, AUD: 1.65, SEK: 11.3, DKK: 7.46, NOK: 11.6, PLN: 4.3, ZAR: 19.5, NGN: 1700 },
};

/** Sequence per spec §11.5. Delays are in days from step 1. */
export const DEFAULT_SEQUENCE = [
  { step: 1, delayDays: 0, kind: 'opener', notes: 'Personalised opener + preview link + compliance block. Plain text.' },
  { step: 2, delayDays: 4, kind: 'nudge', notes: 'Short nudge referencing one concrete thing. Only if no reply.' },
  { step: 3, delayDays: 8, kind: 'quote', notes: 'Quote link, framed as no obligation. Only if no reply.' },
  { step: 4, delayDays: 14, kind: 'closeout', notes: 'One-line close-out; mockup comes down on {date}. Final.' },
];

/** Operator availability for bookable calls (spec addendum: scheduling). Weekly hours in `timezone`; edit in the console. */
export const DEFAULT_AVAILABILITY = {
  timezone: 'Europe/Lisbon',
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 4,
  horizonDays: 14,
  hours: { mon: [['09:00', '12:30'], ['14:00', '18:00']], tue: [['09:00', '12:30'], ['14:00', '18:00']], wed: [['09:00', '12:30'], ['14:00', '18:00']], thu: [['09:00', '12:30'], ['14:00', '18:00']], fri: [['09:00', '12:30'], ['14:00', '17:00']], sat: [], sun: [] },
  busyFeedUrl: null,
  notifyEmail: null,
  meetingTitle: '15-minute call about your website',
  reminders: [{ hoursBefore: 72, confirm: false }, { hoursBefore: 24, confirm: true }, { hoursBefore: 2, confirm: false }],
};
