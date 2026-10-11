import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { EMAIL_VERIFIER, ENRICHMENT_ADAPTERS, EnrichmentAdapter, EmailVerifier, EnrichmentLead } from '../../src/modules/enrichment/enrichment.types';
import { EnrichmentService } from '../../src/modules/enrichment/enrichment.service';
import { ProfilingService } from '../../src/modules/profiling/profiling.service';
import { LlmService, FakeLlmClient } from '../../src/shared/llm/llm.service';
import { QueueRegistry } from '../../src/shared/queues/queue-registry.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { buildContentBrief } from '../../src/modules/profiling/content-brief';

const verifier: EmailVerifier = {
  name: 'fake-verifier', costPerCheckUsd: 0.008,
  async verify(email) {
    if (email.endsWith('@valid.test')) return { state: 'valid', provider: 'fake-verifier', reason: 'ok' };
    if (email.endsWith('@catchall.test')) return { state: 'catchall', provider: 'fake-verifier', reason: 'catch-all domain' };
    if (email.endsWith('@invalid.test')) return { state: 'invalid', provider: 'fake-verifier', reason: 'no mailbox' };
    return { state: 'risky', provider: 'fake-verifier', reason: 'unknown' };
  },
};
const registry: EnrichmentAdapter & { calls: number } = {
  name: 'registry:test', costPerLookupUsd: 0, available: true, calls: 0,
  supports: (l: EnrichmentLead) => l.countryCode === 'MT',
  async find(l) {
    registry.calls++;
    if (l.businessName.includes('NoContact')) return [];
    if (l.businessName.includes('Catchall')) return [{ email: `info@catchall.test`, emailType: 'role_generic', source: 'registry:test', sourceUrl: 'https://registry.test/1', confidence: 0.8 }];
    if (l.businessName.includes('Unsourced')) return [{ email: `boss@valid.test`, emailType: 'named', source: '', sourceUrl: null, confidence: 0.9 }];
    return [
      { email: `info@valid.test`, emailType: 'role_generic', source: 'registry:test', sourceUrl: 'https://registry.test/1', confidence: 0.8 },
      { email: `owner.${l.id.slice(-4)}@valid.test`, emailType: 'named', source: 'registry:test', sourceUrl: 'https://registry.test/1', confidence: 0.7 },
    ];
  },
};
const unavailable: EnrichmentAdapter = { name: 'social-profile', costPerLookupUsd: 0, available: false, unavailableReason: 'no official API', supports: () => true, find: async () => { throw new Error('must not be called'); } };
const expensive: EnrichmentAdapter & { calls: number } = { name: 'data-provider:test', costPerLookupUsd: 0.01, available: true, calls: 0, supports: () => true, async find(l) { expensive.calls++; if (l.businessName.includes('NoContact')) return []; return [{ email: 'late@valid.test', emailType: 'named', source: 'data-provider:test', sourceUrl: null, confidence: 0.5 }]; } };

describe('Enrichment + profiling (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let enrichment: EnrichmentService;
  let profiling: ProfilingService;
  let llm: FakeLlmClient;

  beforeAll(async () => {
    app = await createTestApp((b) =>
      b.overrideProvider(ENRICHMENT_ADAPTERS).useValue([unavailable, registry, expensive]).overrideProvider(EMAIL_VERIFIER).useValue(verifier).overrideProvider(PLACES_CLIENT).useValue({
        async details(placeId: string) {
          return { id: placeId, displayName: 'X', formattedAddress: '1 Republic St, Valletta, Malta', location: null, primaryType: 'dentist', types: ['dentist', 'health'], websiteUri: null, businessStatus: 'OPERATIONAL', rating: 4.6, userRatingCount: 60, nationalPhoneNumber: '+356 2100 0000', internationalPhoneNumber: null, regularOpeningHours: { weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: 9:00 AM – 5:00 PM'] }, priceLevel: 2, editorialSummary: 'Family dental practice.', reviews: [{ text: 'Gentle and professional, great with kids.', rating: 5 }], photos: [], addressComponents: [], raw: { id: placeId, types: ['dentist', 'health'], formattedAddress: '1 Republic St, Valletta, Malta', regularOpeningHours: { weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: 9:00 AM – 5:00 PM'] }, editorialSummary: { text: 'Family dental practice.' }, reviews: [{ text: { text: 'Gentle and professional, great with kids.' }, rating: 5 }], nationalPhoneNumber: '+356 2100 0000', priceLevel: 'PRICE_LEVEL_MODERATE' } };
        },
        async searchNearby() { return []; },
      }),
    );
    prisma = app.get(PrismaService);
    enrichment = app.get(EnrichmentService);
    profiling = app.get(ProfilingService);
    llm = new FakeLlmClient();
    app.get(LlmService).setClient(llm);
  });
  afterAll(() => closeTestApp(app));

  async function qualifiedLead(name: string) {
    const lead = await makeLead(prisma, { businessName: name });
    await prisma.contact.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'qualified' } });
    return lead;
  }

  it('runs adapters in cost order, stops at the first valid hit, stores sourced contacts, picks a named primary, clears the gate and enqueues profiling', async () => {
    const lead = await qualifiedLead('Valletta Dental Clinic Ltd');
    const before = expensive.calls;
    const out = await enrichment.enrich(lead.id);
    expect(out.adaptersTried[0]).toMatchObject({ name: 'social-profile', skipped: 'no official API' });
    expect(out.adaptersTried[1]).toMatchObject({ name: 'registry:test', candidates: 2, valid: 2 });
    expect(expensive.calls).toBe(before); // never reached: stopped at first valid
    expect(out.primary).toMatch(/^owner\./); // named beats role_generic
    expect(out.gate).toBe('clear');
    const after = await prisma.lead.findUnique({ where: { id: lead.id }, include: { contacts: true } });
    expect(after!.stage).toBe('enriched');
    expect(after!.contacts.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(after!.contacts.every((c) => c.source && c.verifiedAt)).toBe(true);
    expect((after!.scoreBreakdown as any).inputs.contact).toBe('named_valid');
    const q = app.get(QueueRegistry).get('profilingClassify');
    const job = await q.getJob(`classify-${lead.id}`);
    expect(job).toBeTruthy();
    expect(await prisma.costEvent.count({ where: { category: 'email_verify', leadId: lead.id } })).toBe(2);
  });

  it('a lead with no email goes to the phone/postal bucket and does not advance; nothing is discarded', async () => {
    const withPhone = await qualifiedLead('NoContact Dental');
    await prisma.lead.update({ where: { id: withPhone.id }, data: { phone: '+356 2100 1111' } });
    const out = await enrichment.enrich(withPhone.id);
    expect(out.primary).toBeNull();
    expect(out.fallbackChannel).toBe('phone_outreach');
    expect((await prisma.lead.findUnique({ where: { id: withPhone.id } }))!.stage).toBe('qualified');
    const noPhone = await qualifiedLead('NoContact Vet');
    await prisma.lead.update({ where: { id: noPhone.id }, data: { phone: null } });
    expect((await enrichment.enrich(noPhone.id)).fallbackChannel).toBe('postal_outreach');
    expect(expensive.calls).toBeGreaterThan(0); // the expensive adapter was tried after the registry found nothing
  });

  it('catchall / unsourced candidates never become primary and never advance a lead', async () => {
    const catchall = await qualifiedLead('Catchall Clinic Ltd');
    const o1 = await enrichment.enrich(catchall.id);
    expect(o1.primary).toBe('late@valid.test'); // registry's catchall was not enough; data-provider's named valid won
    const unsourced = await qualifiedLead('Unsourced Clinic Ltd');
    await enrichment.enrich(unsourced.id);
    const contacts = await prisma.contact.findMany({ where: { leadId: unsourced.id } });
    expect(contacts.find((c) => c.email === 'boss@valid.test')).toBeUndefined();
  });

  it('manual contacts need a source, get verified via the queue, and only valid contacts can be primary', async () => {
    const lead = await qualifiedLead('Manual Ltd');
    await request(app.getHttpServer()).post(`/admin/leads/${lead.id}/contacts`).set(AUTH).send({ email: 'Hello@Valid.test', source: '' }).expect(500);
    const res = await request(app.getHttpServer()).post(`/admin/leads/${lead.id}/contacts`).set(AUTH).send({ email: 'Hello@Valid.test', source: 'phone call with owner 2026-10-01' }).expect(201);
    expect(res.body.email).toBe('hello@valid.test');
    expect(res.body.verification).toBe('unverified');
    await request(app.getHttpServer()).post(`/admin/leads/${lead.id}/contacts/${res.body.id}/primary`).set(AUTH).expect(500);
    await enrichment.verifyContact(res.body.id);
    const ok = await request(app.getHttpServer()).post(`/admin/leads/${lead.id}/contacts/${res.body.id}/primary`).set(AUTH).expect(201);
    expect(ok.body.result).toBe('clear');
  });

  it('the hit-rate report shows per-adapter stats and coverage', async () => {
    const res = await request(app.getHttpServer()).get('/admin/enrichment/report').set(AUTH).expect(200);
    const reg = res.body.adapters.find((a: any) => a.name === 'registry:test');
    expect(reg.tried).toBeGreaterThan(2);
    expect(reg.hitRate).toBeGreaterThan(0);
    expect(res.body.coverage.leads).toBeGreaterThan(0);
    expect(res.body.adapterStatus.find((a: any) => a.name === 'social-profile').available).toBe(false);
  });

  it('classification: high confidence → profiled (+ cost event); the prompt is deterministic and JSON-only', async () => {
    const lead = await makeLead(prisma, { businessName: 'Valletta Dental Clinic Ltd' });
    llm.respond = () => JSON.stringify({ vertical: 'dental', subVertical: 'family dentist', servicesOffered: ['check-ups', 'whitening'], differentiators: ['great with kids'], toneOfVoice: 'clinical', primaryCTA: 'book', languageCode: 'en', confidence: 0.92, insufficientData: false });
    const r = await profiling.classify(lead.id, { advance: false });
    expect(r.routed).toBe('profiled');
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after!.stage).toBe('profiled');
    expect(after!.vertical).toBe('dental');
    const call = llm.calls.at(-1)!;
    expect(call.temperature).toBe(0);
    expect(call.system).toMatch(/JSON only/);
    expect(call.user).toContain('Gentle and professional');
    expect(await prisma.costEvent.count({ where: { category: 'llm', leadId: lead.id } })).toBe(1);
    const brief = await profiling.brief(lead.id);
    expect(brief.openingHours).toHaveLength(2);
    expect(brief.verifiedFacts.join(' ')).toContain('+356 2100 0000');
    expect(brief.languageCode).toBe('en');
  });

  it('low confidence or insufficient data → manual review queue; approve with edits continues, reject marks lost', async () => {
    const lead = await makeLead(prisma, { businessName: 'Mystery Shop' });
    llm.respond = () => JSON.stringify({ vertical: 'other', subVertical: '', servicesOffered: [], differentiators: [], toneOfVoice: 'professional', primaryCTA: 'enquire', languageCode: 'en', confidence: 0.3, insufficientData: true });
    const r = await profiling.classify(lead.id);
    expect(r.routed).toBe('manual_review');
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.stage).toBe('manual_review');
    const queue = await request(app.getHttpServer()).get('/admin/review?type=low_confidence_classification').set(AUTH).expect(200);
    const item = queue.body.find((i: any) => i.leadId === lead.id);
    expect(item.lead.businessName).toBe('Mystery Shop');
    expect(item.payload.inputs.name).toBe('Mystery Shop');
    await request(app.getHttpServer()).post(`/admin/review/${item.id}/approve`).set(AUTH).send({ edits: { vertical: 'retail', subVertical: 'gift shop' } }).expect(201);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after!.stage).toBe('profiled');
    expect((after!.classification as any).vertical).toBe('retail');
    expect((after!.classification as any).confidence).toBe(1);

    const lead2 = await makeLead(prisma, { businessName: 'Another Mystery' });
    await profiling.classify(lead2.id);
    const item2 = (await request(app.getHttpServer()).get('/admin/review').set(AUTH)).body.find((i: any) => i.leadId === lead2.id);
    await request(app.getHttpServer()).post(`/admin/review/${item2.id}/reject`).set(AUTH).send({ note: 'not a real business' }).expect(201);
    expect((await prisma.lead.findUnique({ where: { id: lead2.id } }))!.stage).toBe('lost');
  });

  it('invalid JSON is retried once, then fails loudly; the daily USD cap blocks calls', async () => {
    const lead = await makeLead(prisma);
    let n = 0;
    llm.respond = () => (++n === 1 ? 'Sure! Here is the classification: nope' : '```json\n' + JSON.stringify({ vertical: 'dental', subVertical: 'x', servicesOffered: [], differentiators: [], toneOfVoice: 'clinical', primaryCTA: 'book', languageCode: 'en', confidence: 0.9, insufficientData: false }) + '\n```');
    expect((await profiling.classify(lead.id, { advance: false })).routed).toBe('profiled');
    expect(n).toBe(2);
    llm.respond = () => 'garbage';
    await expect(profiling.classify((await makeLead(prisma)).id)).rejects.toThrow(/invalid JSON/);
    await prisma.costEvent.create({ data: { category: 'llm', units: 1, usd: 1000 } });
    await expect(profiling.classify((await makeLead(prisma)).id)).rejects.toThrow(/daily USD cap/);
    await prisma.costEvent.deleteMany({ where: { usd: 1000 } });
  });

  it('buildContentBrief only contains verifiable facts', () => {
    const brief = buildContentBrief({ businessName: 'B', countryCode: 'MT', city: 'Valletta', phone: null, rating: 4.9, reviewCount: 2, priceLevel: null, lat: null, lng: null, primaryType: 'cafe' }, null, { vertical: 'cafe', subVertical: 'x', servicesOffered: [], differentiators: [], toneOfVoice: 'warm', primaryCTA: 'visit', languageCode: 'en', confidence: 1, insufficientData: false }, { sameTypeInTile: 3, withLiveSite: 2, share: 0.66 }, 'en');
    expect(brief.verifiedFacts).toEqual(['Business name: B', 'Located in Valletta']); // rating with 2 reviews is not quoted
    expect(brief.competitiveContext.share).toBe(0.66);
  });
});
