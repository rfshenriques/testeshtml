import { INestApplicationContext } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../shared/prisma/prisma.service';
import { LlmService, FakeLlmClient } from '../shared/llm/llm.service';
import { GeneratorService } from '../modules/generator/generator.service';
import { PreviewService } from '../modules/preview/preview.service';
import { QuotingService } from '../modules/quoting/quoting.service';
import { MailboxService } from '../modules/outreach/mailbox.service';
import { SequenceService } from '../modules/outreach/sequence.service';
import { CostLedgerService } from '../modules/ops/cost-ledger.service';
import { AlertService } from '../modules/ops/alert.service';
import { GateService } from '../modules/compliance/gate.service';

/**
 * Populates a development database with a realistic campaign so every console screen has data.
 * Uses fake LLM copy and the real Astro build; never touches an external service.
 */
export async function demoSeed(app: INestApplicationContext) {
  const prisma = app.get(PrismaService);
  const llm = new FakeLlmClient();
  llm.respond = (req) => (req.purpose === 'copy' ? JSON.stringify(copyFor(req.user)) : req.purpose === 'reply_draft' ? 'Thanks for getting back to me. Happy to walk you through the mockup on a short call this week; which day suits you?' : JSON.stringify({ intent: 'interested', confidence: 0.9, summary: 'wants a call' }));
  app.get(LlmService).setClient(llm);
  app.get(GeneratorService).setImageSource({ search: async () => [] });

  const campaign = await prisma.campaign.create({
    data: { name: 'Valletta + Sliema (demo)', status: 'complete', countryCode: 'MT', geometry: { kind: 'cities', cities: [{ name: 'Valletta', lat: 35.8989, lng: 14.5146, radiusM: 1500 }, { name: 'Sliema', lat: 35.9122, lng: 14.5042, radiusM: 1500 }] }, includedTypes: ['dentist', 'plumber', 'bakery', 'physiotherapist', 'hair_care'], excludedTypes: [], budgetUsdCap: 25, spendUsd: 6.4, maxLeads: 300 },
  });
  // tiles for the map
  const roots: [number, number, number, number][] = [[14.498, 35.885, 14.531, 35.912], [14.487, 35.899, 14.521, 35.926]];
  for (const bbox of roots) {
    const root = await prisma.tile.create({ data: { campaignId: campaign.id, bbox, depth: 0, status: 'saturated', resultCount: 40 } });
    const [x0, y0, x1, y1] = bbox; const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    const quads: [number, number, number, number][] = [[x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]];
    for (const [i, q] of quads.entries()) await prisma.tile.create({ data: { campaignId: campaign.id, parentId: root.id, bbox: q, depth: 1, status: i === 3 ? 'failed' : 'done', resultCount: 6 + i * 3, liveSiteCount: 3 + i, error: i === 3 ? 'simulated 503 from Places' : null } });
  }
  const tile = await prisma.tile.findFirst({ where: { campaignId: campaign.id, depth: 1 } });
  const costs = app.get(CostLedgerService);
  await costs.record({ category: 'places_search', units: 140, usd: 4.48, campaignId: campaign.id, provider: 'google_places' });
  await costs.record({ category: 'places_details', units: 46, usd: 0.92, campaignId: campaign.id, provider: 'google_places' });
  await costs.record({ category: 'email_verify', units: 38, usd: 0.3, campaignId: campaign.id, provider: 'zerobounce' });
  await costs.record({ category: 'llm', units: 61000, usd: 0.7, campaignId: campaign.id, provider: 'claude' });

  const businesses: { name: string; type: string; vertical: string; city: string; ws: any; rating: number; reviews: number; stage: any; contact?: string; emailType?: any; lat: number; lng: number }[] = [
    { name: 'Valletta Dental Clinic Ltd', type: 'dentist', vertical: 'dental', city: 'Valletta', ws: 'none', rating: 4.8, reviews: 132, stage: 'contacted', contact: 'info@vallettadental.example', emailType: 'role_generic', lat: 35.8992, lng: 14.5120 },
    { name: 'Harbour Bakery Ltd', type: 'bakery', vertical: 'bakery', city: 'Sliema', ws: 'social_only', rating: 4.6, reviews: 88, stage: 'profiled', contact: 'hello@harbourbakery.example', emailType: 'role_generic', lat: 35.9110, lng: 14.5030 },
    { name: 'Camilleri Physiotherapy Ltd', type: 'physiotherapist', vertical: 'medical', city: 'Sliema', ws: 'parked', rating: 4.9, reviews: 61, stage: 'quoted', contact: 'anna@camilleriphysio.example', emailType: 'named', lat: 35.9130, lng: 14.5060 },
    { name: 'Borg & Sons Plumbing Ltd', type: 'plumber', vertical: 'trades', city: 'Valletta', ws: 'broken', rating: 4.4, reviews: 27, stage: 'enriched', contact: 'office@borgplumbing.example', emailType: 'role_generic', lat: 35.8975, lng: 14.5160 },
    { name: 'Maria Borg', type: 'hair_care', vertical: 'salon', city: 'Valletta', ws: 'none', rating: 4.7, reviews: 9, stage: 'enriched', contact: 'maria@mariaborghair.example', emailType: 'named', lat: 35.8980, lng: 14.5100 },
    { name: 'Sliema Smile Studio Ltd', type: 'dentist', vertical: 'dental', city: 'Sliema', ws: 'none', rating: 4.5, reviews: 44, stage: 'qualified', lat: 35.9105, lng: 14.5020 },
    { name: 'Blue Lagoon Bakery', type: 'bakery', vertical: 'bakery', city: 'Valletta', ws: 'none', rating: 4.2, reviews: 15, stage: 'qualified', lat: 35.8995, lng: 14.5135 },
    { name: 'Mystery Services', type: 'plumber', vertical: null as any, city: 'Sliema', ws: 'none', rating: 3.9, reviews: 4, stage: 'manual_review', lat: 35.9125, lng: 14.5055 },
    { name: 'Grand Harbour Dental', type: 'dentist', vertical: 'dental', city: 'Valletta', ws: 'live', rating: 4.9, reviews: 210, stage: 'excluded', lat: 35.8970, lng: 14.5150 },
    { name: 'Vella Hair & Beauty Ltd', type: 'hair_care', vertical: 'salon', city: 'Sliema', ws: 'http_only', rating: 4.3, reviews: 33, stage: 'excluded', lat: 35.9118, lng: 14.5045 },
    { name: 'Zammit Physio', type: 'physiotherapist', vertical: 'medical', city: 'Valletta', ws: 'none', rating: 4.6, reviews: 19, stage: 'suppressed', contact: 'zammit@zammitphysio.example', emailType: 'named', lat: 35.8988, lng: 14.5128 },
    { name: 'Dockside Plumbing Ltd', type: 'plumber', vertical: 'trades', city: 'Valletta', ws: 'none', rating: 4.1, reviews: 12, stage: 'discovered', lat: 35.8960, lng: 14.5170 },
  ];
  const leads: Record<string, string> = {};
  for (const b of businesses) {
    const placeId = `demo-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await prisma.placeRef.upsert({ where: { placeId }, create: { placeId, countryCode: 'MT' }, update: {} });
    await prisma.placeSnapshot.create({ data: { placeId, kind: 'details', raw: { id: placeId, displayName: { text: b.name }, formattedAddress: `${Math.floor(Math.random() * 90) + 1} Republic Street, ${b.city}, Malta`, types: [b.type], rating: b.rating, userRatingCount: b.reviews, nationalPhoneNumber: '+356 2122 4455', regularOpeningHours: { weekdayDescriptions: ['Monday: 9:00 AM – 6:00 PM', 'Tuesday: 9:00 AM – 6:00 PM', 'Wednesday: 9:00 AM – 6:00 PM', 'Thursday: 9:00 AM – 6:00 PM', 'Friday: 9:00 AM – 5:00 PM', 'Saturday: 9:00 AM – 1:00 PM', 'Sunday: Closed'] }, editorialSummary: { text: `${b.name} is a ${b.type.replace('_', ' ')} in ${b.city}.` }, reviews: [{ text: { text: 'Friendly, professional and always on time. Highly recommended.' }, rating: 5 }, { text: { text: 'Great service, fair prices and a lovely team.' }, rating: 5 }] }, expiresAt: new Date(Date.now() + 25 * 86400_000) } });
    const contactState = b.contact ? (b.emailType === 'named' ? 'named_valid' : 'role_valid') : 'phone_only';
    const digitalGap = ({ none: 1, broken: 0.9, parked: 0.85, social_only: 0.75, http_only: 0.4, live: 0 } as Record<string, number>)[b.ws];
    const contactability = ({ named_valid: 1, role_valid: 0.75, phone_only: 0.15 } as Record<string, number>)[contactState];
    const quality = b.rating >= 4 && b.reviews >= 20 ? 1 : Math.min(1, b.reviews / 20) * 0.6;
    const revenue = (b.type === 'dentist' || b.type === 'plumber' || b.type === 'physiotherapist' ? 1 : 0.6) * 0.6 + 0.4 * Math.min(1, Math.log10(b.reviews + 1) / 3);
    const score = b.stage === 'excluded' ? 0 : Math.round((0.3 * contactability + 0.25 * revenue + 0.2 * digitalGap + 0.15 * quality + 0.1 * 0.62) * 1000) / 1000;
    const lead = await prisma.lead.create({
      data: {
        campaignId: campaign.id, placeId, tileId: tile?.id, businessName: b.name, primaryType: b.type, vertical: b.vertical, countryCode: 'MT', city: b.city, phone: '+356 2122 4455', websiteStatus: b.ws, websiteUrl: b.ws === 'none' ? null : `https://${placeId}.example`, rating: b.rating, reviewCount: b.reviews, businessStatus: 'OPERATIONAL', lat: b.lat, lng: b.lng, score, stage: b.stage,
        scoreBreakdown: { contactability, revenueProxy: Math.round(revenue * 1000) / 1000, digitalGap, qualitySignal: quality, competitivePressure: 0.62, score, weights: { contactability: 0.3, revenueProxy: 0.25, digitalGap: 0.2, qualitySignal: 0.15, competitivePressure: 0.1 }, inputs: { primaryType: b.type, websiteStatus: b.ws, rating: b.rating, reviewCount: b.reviews, contact: contactState, competitivePressureShare: 0.62, sameTypeInTile: 8 }, hardExcluded: false, hardExcludeReason: null },
        websiteProbe: { status: b.ws, reason: b.ws === 'none' ? 'no websiteUri' : b.ws === 'social_only' ? 'social host facebook.com' : b.ws === 'parked' ? 'parking heuristic: coming soon' : b.ws === 'broken' ? 'http 503; http 503' : 'ok', attempts: b.ws === 'broken' ? 2 : 1, probedAt: new Date().toISOString() },
        fallbackChannel: b.contact ? 'email' : 'phone_outreach', priority: b.stage === 'contacted' ? 12 : 0, lastTouchAt: new Date(),
        classification: b.vertical ? { vertical: b.vertical, subVertical: b.type.replace('_', ' '), servicesOffered: SERVICES[b.vertical] ?? [], differentiators: ['friendly team', 'on time'], toneOfVoice: b.vertical === 'dental' || b.vertical === 'medical' ? 'clinical' : 'warm', primaryCTA: b.vertical === 'trades' ? 'quote' : 'book', languageCode: 'en', confidence: 0.91, insufficientData: false } : undefined,
        legalGate: b.stage === 'suppressed' ? 'blocked' : b.name === 'Maria Borg' ? 'blocked' : b.contact ? 'clear' : 'pending', legalGateReason: b.name === 'Maria Borg' ? 'individual subscriber: given name + surname pattern with no corporate suffix and low review count' : b.stage === 'suppressed' ? 'suppressed: unsubscribe' : null,
        contacts: b.contact ? { create: { email: b.contact, emailType: b.emailType, source: b.emailType === 'named' ? 'registry:mbr' : 'directory:yellow-pages-mt', sourceUrl: 'https://registry.mbr.mt/companies/C12345', sourceLicence: 'commercial use permitted', confidence: 0.85, verification: 'valid', verifiedAt: new Date(), verifier: 'zerobounce', isPrimary: true } } : undefined,
        events: { create: [{ type: 'lead.discovered', payload: { searchedType: b.type } }, { type: 'qualification.probed', payload: { status: b.ws, score } }] },
      },
    });
    leads[b.name] = lead.id;
  }
  await prisma.reviewItem.create({ data: { leadId: leads['Mystery Services'], type: 'low_confidence_classification', payload: { classification: { vertical: 'other', subVertical: '', servicesOffered: [], differentiators: [], toneOfVoice: 'professional', primaryCTA: 'enquire', languageCode: 'en', confidence: 0.35, insufficientData: true }, inputs: { name: 'Mystery Services', types: ['plumber'], address: null, summary: null, reviews: [] } } } });
  await prisma.reviewItem.create({ data: { leadId: leads['Maria Borg'], type: 'legal_gate_block', payload: { reason: 'individual subscriber', detail: 'given name + surname pattern with no corporate suffix and low review count' } } });
  await prisma.suppression.create({ data: { placeId: 'demo-zammit-physio', reason: 'unsubscribe' } });
  await prisma.suppression.create({ data: { emailHash: 'c0ffee' + 'a'.repeat(58), reason: 'hostile_reply', note: 'legal threat; takedown done' } });

  // Mailboxes
  const mailboxes = app.get(MailboxService);
  await mailboxes.addDomain('getdemostudio.com', 'demo');
  const m1 = await mailboxes.addMailbox('anna@getdemostudio.com', 'getdemostudio.com', 'demo');
  const m2 = await mailboxes.addMailbox('tom@getdemostudio.com', 'getdemostudio.com', 'demo');
  await prisma.mailbox.update({ where: { id: m1.id }, data: { warmupStartedAt: new Date(Date.now() - 6 * 7 * 86400_000), dailyCap: 50, status: 'active' } });
  await prisma.mailbox.update({ where: { id: m2.id }, data: { warmupStartedAt: new Date(Date.now() - 9 * 86400_000), dailyCap: 50 } });

  // Generate + publish a real site for Harbour Bakery, then quote it.
  const generator = app.get(GeneratorService);
  const preview = app.get(PreviewService);
  const quoting = app.get(QuotingService);
  const sequence = app.get(SequenceService);
  sequence.rand = () => 0.5;
  const bakery = leads['Harbour Bakery Ltd'];
  const r = await generator.generate(bakery, { advance: false });
  if (!r.skipped) {
    await preview.publish(bakery);
    await quoting.createQuote(bakery);
    const site = await prisma.generatedSite.findUniqueOrThrow({ where: { leadId: bakery } });
    await preview.trackView(site.id, bakery, { ip: '203.0.113.7', ua: 'demo' });
  }
  // Camilleri Physio: quoted + sequence running + one sent + a reply with a draft
  const physio = leads['Camilleri Physiotherapy Ltd'];
  const q = await quoting.createQuote(physio);
  const rp = await generator.generate(physio, { advance: false });
  if (!rp.skipped) { await preview.publish(physio); await prisma.generatedSite.update({ where: { leadId: physio }, data: { views: 3, lastViewedAt: new Date() } }); }
  const contact = await prisma.contact.findFirstOrThrow({ where: { leadId: physio } });
  const sent = await prisma.outreachMessage.create({ data: { leadId: physio, contactId: contact.id, sequenceStep: 1, mailboxId: m1.id, subject: 'physiotherapist in sliema without a website', bodyText: 'Hi,\n\nI noticed Camilleri Physiotherapy is one of the few physiotherapy practices in Sliema without a website...', bodyHtml: '', status: 'replied', sentAt: new Date(Date.now() - 2 * 86400_000), providerId: 'demo-1', approvedAt: new Date(Date.now() - 2 * 86400_000), approvedBy: 'operator', messageIdHeader: '<demo-1@getdemostudio.com>' } });
  await prisma.reply.create({ data: { leadId: physio, messageId: sent.id, fromEmail: contact.email, receivedAt: new Date(Date.now() - 86400_000), subject: 'Re: physiotherapist in sliema without a website', raw: 'Hi, this looks interesting. Could we talk on Thursday afternoon? Anna', intent: 'interested', confidence: 0.92, classifiedBy: 'llm', suggestedDraft: 'Hi Anna,\n\nThanks for getting back to me. Thursday afternoon works; would 15:00 suit? I will walk you through the mockup and the options, no obligation.\n', handled: false } });
  await prisma.lead.update({ where: { id: physio }, data: { stage: 'replied', sequenceStartedAt: new Date(Date.now() - 2 * 86400_000), sequenceStoppedAt: new Date(Date.now() - 86400_000), sequenceStopReason: 'reply: interested' } });
  await prisma.reviewItem.create({ data: { leadId: physio, type: 'reply_draft', payload: { intent: 'interested' } } });
  // Valletta Dental: sequence running, step 1 sent, step 2 queued awaiting approval
  const dental = leads['Valletta Dental Clinic Ltd'];
  await quoting.createQuote(dental);
  const rd = await generator.generate(dental, { advance: false });
  if (!rd.skipped) await preview.publish(dental);
  const dc = await prisma.contact.findFirstOrThrow({ where: { leadId: dental } });
  await prisma.outreachMessage.create({ data: { leadId: dental, contactId: dc.id, sequenceStep: 1, mailboxId: m1.id, subject: 'dental in valletta without a website', bodyText: 'Hi,\n\nI noticed Valletta Dental Clinic is one of the few dental practices in Valletta without a website: around 62% of the dentists nearby already have one...', bodyHtml: '', status: 'delivered', sentAt: new Date(Date.now() - 3 * 86400_000), providerId: 'demo-2', approvedAt: new Date(), approvedBy: 'operator', messageIdHeader: '<demo-2@getdemostudio.com>' } });
  await prisma.outreachMessage.create({ data: { leadId: dental, contactId: dc.id, sequenceStep: 2, mailboxId: m1.id, subject: 'the dental mockup for valletta dental clinic ltd', bodyText: 'Hi,\n\nShort follow-up on the concept mockup I built for Valletta Dental Clinic Ltd...', bodyHtml: '', status: 'queued', scheduledFor: new Date(Date.now() + 86400_000), requiresApproval: true } });
  await prisma.lead.update({ where: { id: dental }, data: { sequenceStartedAt: new Date(Date.now() - 3 * 86400_000) } });
  await prisma.setting.upsert({ where: { key: 'outreach.approvedSends' }, create: { key: 'outreach.approvedSends', value: 2 }, update: { value: 2 } });

  const alerts = app.get(AlertService);
  await alerts.raise('budget_warning', 'warning', 'Campaign "Valletta + Sliema (demo)" has spent 26% of its budget', { campaignId: campaign.id });
  await alerts.raise('preview_viewed', 'info', 'Harbour Bakery Ltd opened their preview', { leadId: bakery });
  await alerts.raise('reply_received', 'info', 'Camilleri Physiotherapy Ltd replied (interested)', { leadId: physio });
  await app.get(GateService).evaluate(leads['Maria Borg'], { context: 'demo' }).catch(() => undefined);
  return { campaignId: campaign.id, leads: Object.keys(leads).length, quote: q.url, preview: r.skipped ? null : (await prisma.generatedSite.findUnique({ where: { leadId: bakery } }))?.previewUrl };
}

/** Per-business demo copy, derived from the brief the generator passes in (business name + vertical). */
function copyFor(briefUser: string) {
  const m = briefUser.match(/"businessName":\s*"([^"]+)"/);
  const v = briefUser.match(/"vertical":\s*"([^"]+)"/);
  const name = m?.[1] ?? 'The business';
  const city = briefUser.match(/"city":\s*"([^"]+)"/)?.[1] ?? 'Malta';
  const vertical = v?.[1] ?? 'other';
  if (vertical === 'bakery') return COPY;
  const kinds: Record<string, { what: string; services: [string, string][]; cta: string }> = {
    dental: { what: 'dental care', services: [['Check-ups', 'Routine examinations and cleaning, with clear advice on what comes next.'], ['Whitening', 'Professional whitening planned around your schedule and your sensitivity.'], ['Implants', 'Long-lasting replacements for missing teeth, planned carefully and fitted with precision.']], cta: 'Book an appointment' },
    medical: { what: 'physiotherapy', services: [['Sports injuries', 'Assessment and hands-on treatment to get you back to training safely.'], ['Back and neck pain', 'Targeted treatment plans and exercises you can keep doing at home.'], ['Rehabilitation', 'Structured recovery after surgery or injury, one step at a time.']], cta: 'Book a session' },
    trades: { what: 'plumbing', services: [['Emergency repairs', 'Fast response for leaks, blockages and burst pipes.'], ['Boilers and heating', 'Installation, servicing and repairs for all common systems.'], ['Bathrooms', 'Full fit-outs and refurbishments, from pipework to finishing.']], cta: 'Request a quote' },
    salon: { what: 'hair and beauty', services: [['Cuts and styling', 'Precision cuts and styling for every occasion.'], ['Colour', 'Natural-looking colour and highlights, matched to you.'], ['Treatments', 'Conditioning and repair treatments for healthier hair.']], cta: 'Book now' },
  };
  const k = kinds[vertical] ?? kinds.trades;
  return {
    meta: { title: `${name} · ${city}`, description: `${name} offers ${k.what} in ${city}. Get in touch today.` },
    hero: { headline: `${k.what[0].toUpperCase()}${k.what.slice(1)} in ${city}`, subhead: `${name} is here to help, with care and attention to detail.`, ctaLabel: k.cta },
    about: { heading: `About ${name}`, body: `${name} provides ${k.what} for the people of ${city} and the surrounding area. The team takes the time to listen, explain the options clearly and do the job properly, first time. Get in touch to find out how we can help you.` },
    services: k.services.map(([n, d]) => ({ name: n, description: d })),
    whyUs: [{ title: 'Friendly team', body: 'Patients and customers tell us the team is friendly and always on time.' }, { title: 'Clear advice', body: 'We explain your options plainly so there are no surprises.' }, { title: `Local to ${city}`, body: `Easy to reach in ${city}.` }],
    cta: { heading: 'Ready to get started?', body: 'Call or send a message and we will find a time that suits you.', buttonLabel: k.cta },
    placeholdersUsed: ['team photos'],
  };
}
const SERVICES: Record<string, string[]> = { dental: ['check-ups', 'whitening', 'implants'], bakery: ['sourdough', 'pastries', 'coffee'], medical: ['sports injuries', 'back pain', 'rehabilitation'], trades: ['emergency repairs', 'boiler installation', 'bathrooms'], salon: ['cuts', 'colour', 'styling'] };
const COPY = {
  meta: { title: 'Harbour Bakery', description: 'Fresh bread and pastries in Sliema every morning.' },
  hero: { headline: 'Fresh bread every morning', subhead: 'Sourdough, pastries and coffee in the heart of Sliema.', ctaLabel: 'Visit us' },
  about: { heading: 'About the bakery', body: 'Harbour Bakery bakes small batches every morning for the people of Sliema. Everything is made by hand, from the sourdough to the pastries, and the coffee is roasted by a neighbour down the road. Drop in early for the best choice, or order ahead for larger occasions.' },
  services: [{ name: 'Sourdough', description: 'Slow-fermented loaves baked fresh each morning, with a crust that stays crisp all day.' }, { name: 'Pastries', description: 'Croissants, cinnamon rolls and seasonal specials, made with butter and patience.' }, { name: 'Coffee', description: 'Locally roasted espresso and filter coffee to go with your morning pastry.' }],
  whyUs: [{ title: 'Baked daily', body: 'Nothing sits overnight; what you buy was baked that morning.' }, { title: 'Local', body: 'Ingredients from Maltese producers wherever possible.' }, { title: 'Friendly', body: 'A neighbourhood bakery that knows your usual.' }],
  cta: { heading: 'Come in early', body: 'The best selection goes before nine. See you tomorrow morning.', buttonLabel: 'Get directions' },
  placeholdersUsed: ['gallery photos'],
};
