/**
 * One valid SiteBuildInput per template family. Used by the admin "Generator"
 * screen (GET /admin/generator/templates/:id/sample) and the template tests.
 *
 * All businesses, addresses and phone numbers are fictional. Copy follows the
 * §9.3 rules: no prices, awards, years in business, certifications or staff
 * names. Fixtures ship with `images: []` so sample pages render fully offline
 * with grey placeholders; pass your own images to see the photo path.
 */
import type { ContentBrief, SiteBuildInput, TemplateFamily } from '@sitewright/shared-types';
import { TEMPLATE_FAMILIES } from '@sitewright/shared-types';

export type ColourScheme = SiteBuildInput['colourScheme'];
export type Typography = SiteBuildInput['typography'];

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function hours(weekday: string, saturday: string, sunday: string): ContentBrief['openingHours'] {
  return WEEK.map((day) => ({ day, hours: day === 'Saturday' ? saturday : day === 'Sunday' ? sunday : weekday }));
}

function mockup(businessName: string, slug: string): SiteBuildInput['mockup'] {
  return {
    agencyName: 'Northline Studio',
    agencyUrl: 'https://northline.example',
    businessName,
    previewSlug: slug,
    formEndpoint: `https://preview.example/f/${slug}`,
    takedownUrl: `https://preview.example/t/${slug}?token=sample`,
    expiresAt: '2026-11-10T00:00:00.000Z',
    mapEmbedUrl: null,
  };
}

function brief(partial: Partial<ContentBrief> & Pick<ContentBrief, 'businessName' | 'classification'>): ContentBrief {
  return {
    address: null, city: null, countryCode: 'GB', phone: null, internationalPhone: null, openingHours: [],
    priceLevel: null, rating: null, reviewCount: null, reviewExcerpts: [], editorialSummary: null, googleTypes: [],
    lat: null, lng: null, competitiveContext: { sameTypeInTile: 12, withLiveSite: 7, share: 0.58 },
    languageCode: 'en', verifiedFacts: [],
    ...partial,
  };
}

const hospitality: SiteBuildInput = {
  template: 'hospitality', colourScheme: 'a', typography: 'a',
  brief: brief({
    businessName: 'The Copper Kettle',
    classification: { vertical: 'cafe', subVertical: 'Neighbourhood café', servicesOffered: ['Breakfast', 'Brunch', 'Coffee', 'Cakes'], differentiators: ['Open early', 'Dog friendly'], toneOfVoice: 'warm', primaryCTA: 'visit', languageCode: 'en', confidence: 0.92, insufficientData: false },
    address: '14 Mill Lane, Bristol BS1 5QT', city: 'Bristol', countryCode: 'GB', phone: '0117 496 0123', internationalPhone: '+44 117 496 0123',
    openingHours: hours('7:30 AM – 4:00 PM', '8:00 AM – 5:00 PM', '9:00 AM – 3:00 PM'), priceLevel: 2, rating: 4.7, reviewCount: 212,
    reviewExcerpts: ['Lovely spot for a quiet breakfast; the pastries are excellent.', 'Friendly staff and great coffee. The courtyard is a bonus on sunny days.', 'Busy at weekends but worth the wait.'],
    editorialSummary: 'Café serving breakfast, brunch and coffee with a small courtyard.', googleTypes: ['cafe', 'coffee_shop', 'breakfast_restaurant'],
    lat: 51.4545, lng: -2.5879, verifiedFacts: ['Open seven days a week', 'Dogs welcome in the courtyard', 'Takeaway available'],
  }),
  copy: {
    meta: { title: 'The Copper Kettle — Café in Bristol', description: 'Breakfast, brunch and proper coffee on Mill Lane, Bristol. Open seven days a week with a sunny courtyard.' },
    hero: { headline: 'Breakfast worth getting up for', subhead: 'Fresh pastries, hearty brunches and carefully made coffee in the heart of Bristol.', ctaLabel: 'See the menu' },
    about: { heading: 'A neighbourhood café on Mill Lane', body: 'The Copper Kettle is a relaxed café serving breakfast and brunch through to mid-afternoon. Expect freshly baked pastries, generous plates and coffee made with care. Settle into the courtyard with the paper, bring the dog, or grab something to take away on the way to work. Everyone is welcome, whether you have five minutes or the whole morning.' },
    services: [
      { name: 'Breakfast', description: 'Full plates, lighter options and pastries from early morning, with vegetarian choices on the board every day.' },
      { name: 'Weekend brunch', description: 'A longer brunch menu on Saturdays and Sundays, with seasonal specials and freshly squeezed juices.' },
      { name: 'Coffee and cakes', description: 'Espresso drinks, filter coffee and a changing counter of cakes and bakes to eat in or take away.' },
      { name: 'Takeaway', description: 'Everything on the menu is available to take away, with coffee ready in minutes on busy mornings.' },
    ],
    whyUs: [
      { title: 'Open early', body: 'Doors open from half past seven on weekdays for coffee and breakfast before work.' },
      { title: 'Dog friendly', body: 'Four-legged guests are welcome in the courtyard, with water bowls provided.' },
      { title: 'Relaxed and unhurried', body: 'Linger over a second coffee; nobody will rush you out of your seat.' },
    ],
    cta: { heading: 'Reserve a table for brunch', body: 'Weekends get busy. Send a reservation enquiry and we will confirm your table.', buttonLabel: 'Reserve a table' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('The Copper Kettle', 'sample-hospitality-0001'),
};

const appointment: SiteBuildInput = {
  template: 'appointment', colourScheme: 'a', typography: 'b',
  brief: brief({
    businessName: 'Harbour Dental Care',
    classification: { vertical: 'dental', subVertical: 'General dental practice', servicesOffered: ['Check-ups', 'Hygiene', 'Fillings', 'Whitening'], differentiators: ['Evening appointments'], toneOfVoice: 'clinical', primaryCTA: 'book', languageCode: 'en', confidence: 0.95, insufficientData: false },
    address: '3 Quay Street, Plymouth PL4 0DL', city: 'Plymouth', countryCode: 'GB', phone: '01752 496 0456', internationalPhone: '+44 1752 496 0456',
    openingHours: hours('8:30 AM – 6:30 PM', '9:00 AM – 1:00 PM', 'Closed'), priceLevel: null, rating: 4.9, reviewCount: 88,
    reviewExcerpts: ['Calm, modern practice. Everything was explained clearly before any treatment.', 'Got an appointment the same week and the hygienist was very gentle.'],
    editorialSummary: null, googleTypes: ['dentist', 'dental_clinic'], lat: 50.3706, lng: -4.1343, verifiedFacts: ['New patients welcome', 'Evening appointments on weekdays', 'Ground-floor access'],
  }),
  copy: {
    meta: { title: 'Harbour Dental Care — Dentist in Plymouth', description: 'A calm, modern dental practice on Quay Street, Plymouth. Check-ups, hygiene and cosmetic treatments with evening appointments.' },
    hero: { headline: 'Dentistry that puts you at ease', subhead: 'Clear explanations, gentle treatment and appointments that fit around work.', ctaLabel: 'Book now' },
    about: { heading: 'A modern practice on Quay Street', body: 'Harbour Dental Care offers routine check-ups, hygiene visits and cosmetic treatments in a calm, modern setting. Each visit begins with a clear explanation of what we recommend and why, so you can make decisions without pressure. Evening appointments are available on weekdays and the practice has ground-floor access for anyone who finds stairs difficult.' },
    services: [
      { name: 'Check-ups', description: 'Routine examinations with a clear summary of what we find and a plan for anything that needs attention.' },
      { name: 'Hygiene visits', description: 'Professional cleaning and tailored advice to keep gums healthy between appointments.' },
      { name: 'Fillings and repairs', description: 'Tooth-coloured fillings and repairs completed with care and minimal fuss.' },
      { name: 'Teeth whitening', description: 'Supervised whitening with a consultation first to check it is right for you.' },
      { name: 'Emergency appointments', description: 'Same-day slots held back for pain or damage; call as early as you can.' },
    ],
    whyUs: [
      { title: 'Clear explanations', body: 'You will always know what we recommend, why, and what the alternatives are.' },
      { title: 'Evening appointments', body: 'Late slots on weekdays so you need not take time off work.' },
      { title: 'Gentle approach', body: 'Nervous patients are welcome; tell us and we will take things at your pace.' },
    ],
    cta: { heading: 'Book your next appointment', body: 'Request a time that suits you and the practice will confirm by phone or email.', buttonLabel: 'Request an appointment' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Harbour Dental Care', 'sample-appointment-001'),
};

const trades: SiteBuildInput = {
  template: 'trades', colourScheme: 'a', typography: 'b',
  brief: brief({
    businessName: 'Ridgeway Plumbing & Heating',
    classification: { vertical: 'trades', subVertical: 'Plumber and heating engineer', servicesOffered: ['Boiler repairs', 'Bathrooms', 'Leaks', 'Radiators'], differentiators: ['Emergency call-outs'], toneOfVoice: 'professional', primaryCTA: 'call', languageCode: 'en', confidence: 0.9, insufficientData: false },
    address: 'Unit 7, Ridgeway Trading Estate, Swindon SN3 4PQ', city: 'Swindon', countryCode: 'GB', phone: '01793 496 0789', internationalPhone: '+44 1793 496 0789',
    openingHours: hours('7:00 AM – 6:00 PM', '8:00 AM – 1:00 PM', 'Emergency calls only'), priceLevel: null, rating: 4.8, reviewCount: 143,
    reviewExcerpts: ['Turned up when they said they would and fixed the leak in under an hour.', 'Replaced our boiler with no mess and talked us through the controls.', 'Honest advice. Did not try to sell us anything we did not need.'],
    editorialSummary: null, googleTypes: ['plumber', 'heating_contractor'], lat: 51.5558, lng: -1.7797, verifiedFacts: ['Emergency call-outs available', 'Covers Swindon and surrounding villages'],
  }),
  copy: {
    meta: { title: 'Ridgeway Plumbing & Heating — Plumber in Swindon', description: 'Plumbing, heating and boiler work across Swindon. Emergency call-outs, bathroom installations and repairs done properly.' },
    hero: { headline: 'Plumbing and heating, done properly', subhead: 'Repairs, boilers and bathrooms across Swindon, with emergency call-outs when you need them.', ctaLabel: 'Get a quote' },
    about: { heading: 'Local plumbers who turn up', body: 'Ridgeway Plumbing & Heating handles everything from dripping taps to full bathroom installations and boiler replacements. We give clear quotes before work starts, keep the job tidy and explain what we have done when we finish. Emergency call-outs are available for burst pipes and heating failures, and we cover Swindon and the surrounding villages.' },
    services: [
      { name: 'Boiler repairs and servicing', description: 'Fault finding, repairs and annual servicing to keep your heating reliable through the winter.' },
      { name: 'Emergency plumbing', description: 'Burst pipes, leaks and blocked drains dealt with quickly; call for the fastest response.' },
      { name: 'Bathroom installation', description: 'Complete bathroom fitting including plumbing, tiling coordination and finishing touches.' },
      { name: 'Radiators and heating', description: 'New radiators, power flushing and heating controls fitted and balanced correctly.' },
      { name: 'Taps, toilets and leaks', description: 'The small jobs that make a big difference, done quickly without a call-out drama.' },
      { name: 'Landlord services', description: 'Routine checks and prompt repairs for rental properties, with clear reports for your records.' },
    ],
    whyUs: [
      { title: 'Clear quotes first', body: 'You get a written quote before any work begins; no surprises on the invoice.' },
      { title: 'We turn up on time', body: 'Agreed appointment windows and a call if anything changes.' },
      { title: 'Tidy work', body: 'Dust sheets down, waste removed, and the job explained when we leave.' },
    ],
    cta: { heading: 'Need a plumber today?', body: 'Call now for emergencies, or describe the job and we will send a quote.', buttonLabel: 'Request a quote' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Ridgeway Plumbing & Heating', 'sample-trades-00000001'),
};

const professional: SiteBuildInput = {
  template: 'professional', colourScheme: 'a', typography: 'a',
  brief: brief({
    businessName: 'Marlow & Finch Accountants',
    classification: { vertical: 'accounting', subVertical: 'Accountancy practice for small businesses', servicesOffered: ['Year-end accounts', 'Tax returns', 'Bookkeeping', 'Payroll'], differentiators: ['Fixed monthly fees'], toneOfVoice: 'professional', primaryCTA: 'enquire', languageCode: 'en', confidence: 0.93, insufficientData: false },
    address: '22 Castle Street, Reading RG1 7RD', city: 'Reading', countryCode: 'GB', phone: '0118 496 0321', internationalPhone: '+44 118 496 0321',
    openingHours: hours('9:00 AM – 5:30 PM', 'Closed', 'Closed'), priceLevel: null, rating: 5, reviewCount: 41,
    reviewExcerpts: ['Took the stress out of my first year of self-employment. Responsive and plain-speaking.', 'Moved our limited company accounts here and the handover was painless.'],
    editorialSummary: null, googleTypes: ['accounting', 'tax_consultant'], lat: 51.4543, lng: -0.9781, verifiedFacts: ['Works with sole traders and limited companies', 'Fixed monthly fee packages available', 'Remote and in-person meetings'],
  }),
  copy: {
    meta: { title: 'Marlow & Finch — Accountants in Reading', description: 'Plain-speaking accountants for small businesses in Reading. Year-end accounts, tax returns, bookkeeping and payroll on fixed monthly fees.' },
    hero: { headline: 'Accounting without the jargon', subhead: 'Year-end accounts, tax and bookkeeping for small businesses, explained in plain English.', ctaLabel: 'Arrange a call' },
    about: { heading: 'Advisers for owner-managed businesses', body: 'Marlow & Finch works with sole traders, partnerships and limited companies across Reading and beyond. We prepare accounts and tax returns, keep your books in order and run payroll, all for a fixed monthly fee agreed in advance. Meetings can be in person on Castle Street or online, and questions between meetings are always welcome.' },
    services: [
      { name: 'Year-end accounts', description: 'Statutory accounts prepared and filed on time, with a plain-English summary of what the numbers mean.' },
      { name: 'Self-assessment and corporation tax', description: 'Tax returns completed accurately with reminders well before deadlines, so nothing is left to the last minute.' },
      { name: 'Bookkeeping', description: 'Monthly bookkeeping on cloud software so you always know where the business stands.' },
      { name: 'Payroll', description: 'Payslips, submissions and pension filings handled each pay run without fuss.' },
      { name: 'Business start-up advice', description: 'Help choosing a structure, registering and setting up systems that will scale with you.' },
    ],
    whyUs: [
      { title: 'Fixed monthly fees', body: 'Agreed in advance so you can budget; no surprise bills for phone calls.' },
      { title: 'Plain English', body: 'We explain what matters for your decisions and skip the jargon.' },
      { title: 'Deadlines handled', body: 'Reminders and filings managed for you, well ahead of time.' },
    ],
    cta: { heading: 'Talk to us about your business', body: 'Tell us briefly what you need and we will suggest a sensible next step.', buttonLabel: 'Send an enquiry' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Marlow & Finch Accountants', 'sample-professional-01'),
};

const retail: SiteBuildInput = {
  template: 'retail', colourScheme: 'a', typography: 'b',
  brief: brief({
    businessName: 'Bramble & Thread',
    classification: { vertical: 'retail', subVertical: 'Independent homeware and gift shop', servicesOffered: ['Homeware', 'Gifts', 'Stationery', 'Gift wrapping'], differentiators: ['Local makers'], toneOfVoice: 'warm', primaryCTA: 'visit', languageCode: 'en', confidence: 0.9, insufficientData: false },
    address: '9 Market Row, Norwich NR2 1EP', city: 'Norwich', countryCode: 'GB', phone: '01603 496 0654', internationalPhone: '+44 1603 496 0654',
    openingHours: hours('10:00 AM – 5:30 PM', '9:30 AM – 6:00 PM', '11:00 AM – 4:00 PM'), priceLevel: 2, rating: 4.8, reviewCount: 67,
    reviewExcerpts: ['A treasure trove of lovely things. Beautifully wrapped gifts too.', 'Great selection from local makers; I always find something.'],
    editorialSummary: 'Independent shop selling homeware, gifts and stationery from local makers.', googleTypes: ['gift_shop', 'home_goods_store'], lat: 52.6286, lng: 1.2930, verifiedFacts: ['Stocks work by local makers', 'Complimentary gift wrapping', 'Open seven days a week'],
  }),
  copy: {
    meta: { title: 'Bramble & Thread — Homeware and Gifts, Norwich', description: 'Independent homeware, gifts and stationery from local makers on Market Row, Norwich. Open seven days with complimentary gift wrapping.' },
    hero: { headline: 'Thoughtful things for home and friends', subhead: 'Homeware, gifts and stationery from local makers, in an independent shop on Market Row.', ctaLabel: 'Browse the shop' },
    about: { heading: 'An independent shop on Market Row', body: 'Bramble & Thread stocks homeware, gifts and stationery chosen for their craft and character, with a strong showing from makers in and around Norwich. The shelves change with the seasons, so there is always something new to discover. Gift wrapping is complimentary, and the team is happy to help you find the right thing for the right person.' },
    services: [
      { name: 'Homeware', description: 'Ceramics, textiles, candles and small pieces for the kitchen and living room, many made locally.' },
      { name: 'Gifts', description: 'Presents for every occasion, wrapped beautifully and ready to hand over.' },
      { name: 'Stationery', description: 'Cards, notebooks, pens and prints from independent illustrators and printers.' },
      { name: 'Local makers', description: 'A rotating selection of work from Norfolk artists, potters and textile designers.' },
    ],
    whyUs: [
      { title: 'Chosen with care', body: 'Everything in the shop is picked by hand for its quality and story.' },
      { title: 'Supports local makers', body: 'Many pieces come from makers within a short drive of the shop.' },
      { title: 'Free gift wrapping', body: 'Every gift leaves the shop wrapped and ready to give.' },
    ],
    cta: { heading: 'Looking for something particular?', body: 'Ask about stock, orders or gift ideas and the shop will get back to you.', buttonLabel: 'Ask the shop' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Bramble & Thread', 'sample-retail-000000001'),
};

const fitness: SiteBuildInput = {
  template: 'fitness', colourScheme: 'a', typography: 'b',
  brief: brief({
    businessName: 'Ironworks Strength Club',
    classification: { vertical: 'gym', subVertical: 'Strength and conditioning gym', servicesOffered: ['Group classes', 'Personal training', 'Open gym'], differentiators: ['Coach-led sessions'], toneOfVoice: 'energetic', primaryCTA: 'book', languageCode: 'en', confidence: 0.91, insufficientData: false },
    address: 'Arch 12, Foundry Lane, Sheffield S3 8DB', city: 'Sheffield', countryCode: 'GB', phone: '0114 496 0987', internationalPhone: '+44 114 496 0987',
    openingHours: hours('6:00 AM – 9:00 PM', '8:00 AM – 4:00 PM', '9:00 AM – 2:00 PM'), priceLevel: null, rating: 4.9, reviewCount: 156,
    reviewExcerpts: ['Coaches actually coach. My form has improved more in a few months here than in years elsewhere.', 'Welcoming community, no posing, just good training.', 'Early morning classes are perfect before work.'],
    editorialSummary: null, googleTypes: ['gym', 'fitness_center'], lat: 53.3876, lng: -1.4679, verifiedFacts: ['Coach-led group sessions', 'Open from six in the morning on weekdays', 'Beginners welcome'],
  }),
  copy: {
    meta: { title: 'Ironworks Strength Club — Gym in Sheffield', description: 'Coach-led strength and conditioning in Sheffield. Group classes, personal training and open gym from six in the morning.' },
    hero: { headline: 'Train with a coach, every session', subhead: 'Strength and conditioning classes, personal training and open gym under the arches in Sheffield.', ctaLabel: 'Book a trial' },
    about: { heading: 'Strength training for everyone', body: 'Ironworks Strength Club is a coach-led gym for people who want to get stronger safely. Every group session is programmed and supervised, so beginners learn proper technique from day one and experienced lifters keep progressing. Personal training and open gym time are available alongside the class timetable, and the community is friendly, focused and free of posing.' },
    services: [
      { name: 'Strength classes', description: 'Coached barbell sessions in small groups, scaled to your level and tracked over time.' },
      { name: 'Conditioning', description: 'Short, intense sessions built around rowing, bikes, sleds and bodyweight work.' },
      { name: 'Beginners course', description: 'A structured introduction to the main lifts and how to train safely, before joining classes.' },
      { name: 'Personal training', description: 'One-to-one coaching built around your goals, injuries and schedule.' },
      { name: 'Open gym', description: 'Train on your own programme with access to platforms, racks and conditioning kit.' },
    ],
    whyUs: [
      { title: 'Coached, not supervised', body: 'A coach watches every rep in classes and corrects technique as you go.' },
      { title: 'Early and late sessions', body: 'Classes from six in the morning and into the evening on weekdays.' },
      { title: 'Beginners welcome', body: 'A dedicated course gets new members comfortable before they join classes.' },
    ],
    cta: { heading: 'Try a session on us', body: 'Request a free trial class and see whether coached training suits you.', buttonLabel: 'Request a trial' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Ironworks Strength Club', 'sample-fitness-00000001'),
};

export const SAMPLE_INPUTS: Record<TemplateFamily, SiteBuildInput> = { hospitality, appointment, trades, professional, retail, fitness };

export { TEMPLATE_FAMILIES };

/** A deep copy of the family's fixture with the requested colour scheme and typographic pairing applied. */
export function sampleInput(family: TemplateFamily, colourScheme: ColourScheme = 'a', typography: Typography = 'a'): SiteBuildInput {
  const base = SAMPLE_INPUTS[family];
  if (!base) throw new Error(`Unknown template family: ${family}`);
  const copy: SiteBuildInput = JSON.parse(JSON.stringify(base));
  copy.colourScheme = colourScheme;
  copy.typography = typography;
  return copy;
}
