/**
 * Per-country outreach policy table (spec §1.1).
 * Default for any country NOT in this table is BLOCKED. Fail closed.
 * Every entry ships with confirmedByCounsel=false; the operator must confirm with counsel before go-live.
 */
export interface JurisdictionPolicyInput {
  countryCode: string; // ISO 3166-1 alpha-2
  b2bColdEmailAllowed: boolean; // corporate addresses of legal persons
  soleTraderTreatedAsIndividual: boolean;
  priorConsentRequired: boolean; // if true -> outreach blocked, phone/post only
  requiresPhysicalAddressInFooter: boolean;
  requiresDataSourceDisclosure: boolean; // GDPR Art.14
  maxFollowUps: number;
  optOutHonourWindowHours: number; // must be <= 72
  defaultLanguageCode: string;
  defaultCurrency: string;
  notes: string;
}

const gdpr = {
  requiresPhysicalAddressInFooter: true,
  requiresDataSourceDisclosure: true,
  maxFollowUps: 3,
  optOutHonourWindowHours: 24,
};

export const JURISDICTIONS: JurisdictionPolicyInput[] = [
  // --- Permissive-for-B2B-corporate EU/EEA positions (spec §1.1) ---
  { countryCode: 'MT', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: 'Corporate-subscriber B2B email generally permissible with clear identity and opt-out; sole traders treated as individuals. Confirm with counsel.' },
  { countryCode: 'IE', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: 'ePrivacy Regs 2011: B2B to corporate subscribers permitted with opt-out; sole traders/partnerships are individuals. Confirm with counsel.' },
  { countryCode: 'NL', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'nl', defaultCurrency: 'EUR', notes: 'Telecommunicatiewet art. 11.7: B2B to legal persons permitted; eenmanszaak treated as individual. Confirm with counsel.' },
  { countryCode: 'SE', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'sv', defaultCurrency: 'SEK', notes: 'Marknadsföringslagen: B2B to legal persons permitted with identity + opt-out. Confirm with counsel.' },
  { countryCode: 'DK', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'da', defaultCurrency: 'DKK', notes: 'Markedsføringsloven §10 is strict; B2B interpretation contested. Treat sole traders as individuals. Confirm with counsel.' },
  { countryCode: 'FI', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'fi', defaultCurrency: 'EUR', notes: 'B2B marketing to legal persons permitted with opt-out. Confirm with counsel.' },
  { countryCode: 'NO', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'nb', defaultCurrency: 'NOK', notes: 'Markedsføringsloven §15: B2B to legal persons permitted. EEA/GDPR applies. Confirm with counsel.' },
  { countryCode: 'FR', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'fr', defaultCurrency: 'EUR', notes: 'CNIL: B2B to professional addresses permitted if related to role, with opt-out. Confirm with counsel.' },
  { countryCode: 'BE', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'nl', defaultCurrency: 'EUR', notes: 'CDE art. XII.13: legal persons may be contacted with impersonal addresses; natural persons need consent. Confirm with counsel.' },
  { countryCode: 'LU', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'fr', defaultCurrency: 'EUR', notes: 'B2B to legal persons permitted with opt-out. Confirm with counsel.' },
  { countryCode: 'PT', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'pt', defaultCurrency: 'EUR', notes: 'Lei 41/2004 art. 13-A: legal persons opt-out model. Confirm with counsel.' },
  // --- Strict / consent-first EU positions: blocked for email ---
  { countryCode: 'DE', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, ...gdpr, defaultLanguageCode: 'de', defaultCurrency: 'EUR', notes: 'UWG §7: effectively requires prior consent for commercial email, including B2B. BLOCKED for email; phone/post only.' },
  { countryCode: 'IT', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, ...gdpr, defaultLanguageCode: 'it', defaultCurrency: 'EUR', notes: 'Codice Privacy art. 130: strict. BLOCKED by default.' },
  { countryCode: 'AT', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, ...gdpr, defaultLanguageCode: 'de', defaultCurrency: 'EUR', notes: 'TKG §174: prior consent required for commercial email. BLOCKED.' },
  { countryCode: 'ES', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, ...gdpr, defaultLanguageCode: 'es', defaultCurrency: 'EUR', notes: 'LSSI art. 21: consent required absent prior relationship. BLOCKED by default; operator may revisit with counsel.' },
  { countryCode: 'PL', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, ...gdpr, defaultLanguageCode: 'pl', defaultCurrency: 'PLN', notes: 'Prawo komunikacji elektronicznej: consent required. BLOCKED.' },
  // --- Non-EU ---
  { countryCode: 'GB', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, ...gdpr, defaultLanguageCode: 'en', defaultCurrency: 'GBP', notes: 'PECR permits B2B email to corporate subscribers; sole traders and partnerships are individual subscribers and need consent. UK GDPR Art.14 applies.' },
  { countryCode: 'US', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: false, priorConsentRequired: false, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: false, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'USD', notes: 'CAN-SPAM: opt-out model, physical postal address mandatory in footer, honour opt-out within 10 business days (we honour immediately).' },
  { countryCode: 'CA', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: false, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'CAD', notes: 'CASL: express or implied consent required; conspicuous-publication implied consent is narrow. BLOCKED by default pending counsel.' },
  { countryCode: 'AU', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: false, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'AUD', notes: 'Spam Act 2003: consent required; inferred consent from conspicuous publication is narrow. BLOCKED by default pending counsel.' },
  { countryCode: 'ZA', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'ZAR', notes: 'POPIA s69: electronic direct marketing requires consent unless existing customer. BLOCKED by default.' },
  { countryCode: 'NG', b2bColdEmailAllowed: false, soleTraderTreatedAsIndividual: true, priorConsentRequired: true, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 72, defaultLanguageCode: 'en', defaultCurrency: 'NGN', notes: 'NDPA 2023: consent-preferred, legitimate interest arguable for B2B. DECISION for operator; blocked until decided.' },
];
