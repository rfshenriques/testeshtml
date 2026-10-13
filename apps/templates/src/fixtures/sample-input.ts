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
    bookingUrl: `https://preview.example/p/${slug}/book`,
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

const clinic: SiteBuildInput = {
  template: 'clinic', colourScheme: 'a', typography: 'b',
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
  mockup: mockup('Harbour Dental Care', 'sample-clinic-000001'),
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


const beauty: SiteBuildInput = {
  template: 'beauty', colourScheme: 'a', typography: 'a',
  brief: brief({
    businessName: 'Atelier Rowe',
    classification: { vertical: 'salon', subVertical: 'Hair salon and barbers', servicesOffered: ['Cuts', 'Colour', 'Blow-dry', 'Beard trims'], differentiators: ['Walk-ins on Saturdays', 'Late opening Thursdays'], toneOfVoice: 'premium', primaryCTA: 'book', languageCode: 'en', confidence: 0.93, insufficientData: false },
    address: '22 Church Street, Leeds LS2 7DJ', city: 'Leeds', countryCode: 'GB', phone: '0113 496 0789', internationalPhone: '+44 113 496 0789',
    openingHours: hours('10:00 AM – 7:00 PM', '9:00 AM – 5:00 PM', 'Closed'), priceLevel: 2, rating: 4.8, reviewCount: 156,
    reviewExcerpts: ['Best cut I have had in years; they actually listened to what I wanted.', 'Relaxed atmosphere and the colour came out exactly as discussed.', 'Walked in on a Saturday and was seen within twenty minutes.'],
    editorialSummary: 'Hair salon and barbers offering cuts, colour and styling.', googleTypes: ['hair_salon', 'barber_shop', 'beauty_salon'],
    lat: 53.7997, lng: -1.5492, verifiedFacts: ['Walk-ins welcome on Saturdays', 'Open until 7 pm on weekdays', 'Card and contactless accepted'],
  }),
  copy: {
    meta: { title: 'Atelier Rowe — Hair Salon & Barbers in Leeds', description: 'Cuts, colour and styling on Church Street, Leeds. Walk-ins on Saturdays and late opening on weekdays.' },
    hero: { headline: 'Hair that looks like you, only better', subhead: 'A relaxed salon and barbers where every appointment starts with a proper conversation about what you want.', ctaLabel: 'Book a chair' },
    about: { heading: 'A salon on Church Street', body: 'Atelier Rowe is a small salon and barbers in the centre of Leeds. The team cuts, colours and styles for everyone, from a quick tidy-up to a full change. Appointments are unhurried, consultations are honest and the coffee is decent. Walk in on a Saturday or book ahead for weekday evenings.' },
    services: [
      { name: 'Cut and finish', description: 'A consultation, precision cut and finish tailored to your hair and how you wear it day to day.' },
      { name: 'Colour', description: 'Full colour, balayage, highlights and toners, with a patch test for new clients.' },
      { name: 'Barbering', description: 'Scissor and clipper cuts, skin fades and hot-towel beard trims.' },
      { name: 'Blow-dry and styling', description: 'Event styling and blow-dries that last; bring a photo or let us suggest something.' },
    ],
    whyUs: [
      { title: 'A proper consultation', body: 'Every appointment starts with a conversation about your hair, your routine and what you want.' },
      { title: 'Late opening', body: 'Open until seven on weekdays so you can come straight from work.' },
      { title: 'Walk-ins welcome', body: 'No appointment on a Saturday? Walk in and we will fit you in as soon as a chair is free.' },
    ],
    cta: { heading: 'Book your next appointment', body: 'Choose a service and a time; the salon will confirm by text or email.', buttonLabel: 'Book a chair' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Atelier Rowe', 'sample-beauty-000001'),
};

const automotive: SiteBuildInput = {
  template: 'automotive', colourScheme: 'a', typography: 'e',
  brief: brief({
    businessName: 'Kestrel Motors',
    classification: { vertical: 'automotive', subVertical: 'Independent garage', servicesOffered: ['Servicing', 'MOT', 'Diagnostics', 'Tyres', 'Brakes'], differentiators: ['Courtesy car', 'While-you-wait MOT'], toneOfVoice: 'professional', primaryCTA: 'book', languageCode: 'en', confidence: 0.94, insufficientData: false },
    address: 'Unit 4, Foundry Lane, Sheffield S3 8JD', city: 'Sheffield', countryCode: 'GB', phone: '0114 496 0321', internationalPhone: '+44 114 496 0321',
    openingHours: hours('8:00 AM – 5:30 PM', '8:30 AM – 1:00 PM', 'Closed'), priceLevel: null, rating: 4.7, reviewCount: 203,
    reviewExcerpts: ['Honest garage. They showed me the worn part and explained the options before doing anything.', 'MOT done while I waited, with a coffee. Fair price and no upselling.', 'Fixed an intermittent fault two other places could not find.'],
    editorialSummary: 'Independent garage offering servicing, MOT testing and repairs.', googleTypes: ['car_repair', 'auto_parts_store'],
    lat: 53.3886, lng: -1.4716, verifiedFacts: ['MOT testing on site', 'Courtesy car available on request', 'All makes and models'],
  }),
  copy: {
    meta: { title: 'Kestrel Motors — Garage, MOT & Servicing in Sheffield', description: 'Independent garage on Foundry Lane, Sheffield. Servicing, MOT, diagnostics, tyres and brakes for all makes and models.' },
    hero: { headline: 'Straight answers, properly fixed cars', subhead: 'Servicing, MOT and repairs for all makes and models, explained in plain English before any work starts.', ctaLabel: 'Book a service' },
    about: { heading: 'An independent garage on Foundry Lane', body: 'Kestrel Motors is an independent garage serving Sheffield drivers. The workshop handles routine servicing, MOT testing, diagnostics and repairs on all makes and models. You will get a clear explanation and a price before anything is done, and a courtesy car can be arranged if the job takes longer than a day.' },
    services: [
      { name: 'Servicing', description: 'Interim and full services to manufacturer schedules, with the service book stamped.' },
      { name: 'MOT testing', description: 'MOT tests on site, often while you wait; retests included where applicable.' },
      { name: 'Diagnostics', description: 'Warning lights, intermittent faults and electrical problems traced with proper diagnostic tools.' },
      { name: 'Tyres and brakes', description: 'Tyres fitted and balanced; brake pads, discs and fluid checked and replaced.' },
      { name: 'Clutch and gearbox', description: 'Clutch replacements and gearbox repairs with a clear quote first.' },
      { name: 'Air conditioning', description: 'Re-gas and leak checks so the cabin stays cool in summer.' },
    ],
    whyUs: [
      { title: 'Price before work', body: 'Nothing is done until you have agreed a clear quote.' },
      { title: 'Courtesy car', body: 'Keep moving while your car is in the workshop; ask when you book.' },
      { title: 'All makes and models', body: 'Petrol, diesel, hybrid and electric, from small hatchbacks to vans.' },
    ],
    cta: { heading: 'Book your car in', body: 'Tell us the registration and what you need; the workshop will confirm a slot.', buttonLabel: 'Book a service' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Kestrel Motors', 'sample-automotive-0001'),
};

const property: SiteBuildInput = {
  template: 'property', colourScheme: 'a', typography: 'b',
  brief: brief({
    businessName: 'Marlow & Finch',
    classification: { vertical: 'realestate', subVertical: 'Estate and letting agents', servicesOffered: ['Sales', 'Lettings', 'Valuations', 'Property management'], differentiators: ['Local office', 'Accompanied viewings'], toneOfVoice: 'professional', primaryCTA: 'enquire', languageCode: 'en', confidence: 0.92, insufficientData: false },
    address: '8 Market Square, Cambridge CB2 3QJ', city: 'Cambridge', countryCode: 'GB', phone: '01223 496 0654', internationalPhone: '+44 1223 496 0654',
    openingHours: hours('9:00 AM – 6:00 PM', '9:00 AM – 4:00 PM', 'Closed'), priceLevel: null, rating: 4.6, reviewCount: 74,
    reviewExcerpts: ['Sold our house within a month and kept us informed at every stage.', 'As tenants we found them responsive and fair.', 'Honest valuation rather than an inflated one to win the instruction.'],
    editorialSummary: 'Estate and letting agents covering Cambridge and surrounding villages.', googleTypes: ['real_estate_agency'],
    lat: 52.2053, lng: 0.1218, verifiedFacts: ['Sales and lettings from one office', 'Accompanied viewings', 'Covering Cambridge and surrounding villages'],
  }),
  copy: {
    meta: { title: 'Marlow & Finch — Estate & Letting Agents in Cambridge', description: 'Sales, lettings, valuations and property management from Market Square, Cambridge. Accompanied viewings and honest advice.' },
    hero: { headline: 'Moving in Cambridge, made simple', subhead: 'Sales, lettings and honest valuations from an office on Market Square that knows every street.', ctaLabel: 'Request a valuation' },
    about: { heading: 'An agency on Market Square', body: 'Marlow & Finch handles sales, lettings and property management across Cambridge and the surrounding villages. Sellers get a realistic valuation and a plan to market the property well; landlords get vetted tenants and a managed service; buyers and tenants get accompanied viewings and straight answers. One office, one team, start to finish.' },
    services: [
      { name: 'Selling', description: 'Valuation, photography, listing, viewings and negotiation through to completion.' },
      { name: 'Lettings', description: 'Tenant referencing, agreements and move-in, with optional full management.' },
      { name: 'Valuations', description: 'A realistic market appraisal of your home with no obligation.' },
      { name: 'Property management', description: 'Rent collection, maintenance and inspections handled on the landlord’s behalf.' },
    ],
    whyUs: [
      { title: 'Local knowledge', body: 'An office on Market Square and a team that lives in the area.' },
      { title: 'Accompanied viewings', body: 'A member of the team at every viewing to answer questions on the spot.' },
      { title: 'Realistic advice', body: 'Valuations based on what sells, not on what wins the instruction.' },
    ],
    cta: { heading: 'Thinking of selling or letting?', body: 'Request a free valuation and the team will arrange a visit at a time that suits you.', buttonLabel: 'Request a valuation' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Marlow & Finch', 'sample-property-000001'),
};

const education: SiteBuildInput = {
  template: 'education', colourScheme: 'a', typography: 'c',
  brief: brief({
    businessName: 'Bright Path Tutoring',
    classification: { vertical: 'education', subVertical: 'Tutoring centre', servicesOffered: ['Maths', 'English', 'Science', 'Exam preparation'], differentiators: ['Small groups', 'Weekend sessions'], toneOfVoice: 'warm', primaryCTA: 'enquire', languageCode: 'en', confidence: 0.9, insufficientData: false },
    address: '41 Station Road, Reading RG1 1LG', city: 'Reading', countryCode: 'GB', phone: '0118 496 0987', internationalPhone: '+44 118 496 0987',
    openingHours: hours('3:30 PM – 8:00 PM', '9:00 AM – 4:00 PM', '10:00 AM – 2:00 PM'), priceLevel: null, rating: 4.9, reviewCount: 52,
    reviewExcerpts: ['My daughter went from dreading maths to looking forward to Tuesdays.', 'Small groups and tutors who explain things patiently.', 'Great exam preparation; the practice papers made all the difference.'],
    editorialSummary: 'Tutoring centre offering small-group and one-to-one lessons.', googleTypes: ['tutoring_service', 'school'],
    lat: 51.4587, lng: -0.9713, verifiedFacts: ['Small groups of up to six', 'One-to-one sessions available', 'Weekend sessions'],
  }),
  copy: {
    meta: { title: 'Bright Path Tutoring — Maths, English & Science in Reading', description: 'Small-group and one-to-one tutoring on Station Road, Reading. Maths, English, science and exam preparation for all ages.' },
    hero: { headline: 'Confident learners, one lesson at a time', subhead: 'Small groups, patient tutors and lessons shaped around each student in the centre of Reading.', ctaLabel: 'Book a free assessment' },
    about: { heading: 'A tutoring centre on Station Road', body: 'Bright Path Tutoring runs small-group and one-to-one sessions in maths, English and science for primary and secondary students. Every student starts with a free assessment so the tutor knows where to focus. Sessions run after school and at weekends, and parents receive a short progress note after each half term.' },
    services: [
      { name: 'Maths', description: 'From number confidence in primary years to GCSE and A level problem solving.' },
      { name: 'English', description: 'Reading, writing and comprehension, with a focus on structure and clear expression.' },
      { name: 'Science', description: 'Biology, chemistry and physics support with practical examples and past-paper practice.' },
      { name: 'Exam preparation', description: 'Structured revision, timed practice and feedback in the run-up to exams.' },
      { name: 'One-to-one sessions', description: 'Individual lessons for students who need a tailored pace or specific catch-up.' },
    ],
    whyUs: [
      { title: 'Small groups', body: 'Groups of up to six so every student gets attention in every session.' },
      { title: 'Free assessment', body: 'A short assessment before the first lesson so we start in the right place.' },
      { title: 'Progress you can see', body: 'A written note each half term on what has improved and what is next.' },
    ],
    cta: { heading: 'Start with a free assessment', body: 'Tell us about your child and the subjects you have in mind; we will suggest the right group.', buttonLabel: 'Book a free assessment' },
    placeholdersUsed: [],
  },
  images: [],
  mockup: mockup('Bright Path Tutoring', 'sample-education-00001'),
};

export const SAMPLE_INPUTS: Record<TemplateFamily, SiteBuildInput> = { hospitality, beauty, clinic, trades, automotive, professional, property, education, retail, fitness };

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
