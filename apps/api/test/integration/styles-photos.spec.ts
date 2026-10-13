import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { FakeSiteBuilder } from '../fake-builder';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AstroSiteBuilder } from '../../src/modules/generator/site-builder.service';
import { GeneratorService } from '../../src/modules/generator/generator.service';
import { PlacePhotosService } from '../../src/modules/generator/place-photos.service';
import { LlmService, FakeLlmClient } from '../../src/shared/llm/llm.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { ENV } from '../../src/shared/config/config.module';
import { QuotingService } from '../../src/modules/quoting/quoting.service';

const CLASSIFICATION = { vertical: 'bakery', subVertical: 'artisan bakery', servicesOffered: ['sourdough'], differentiators: ['baked daily'], toneOfVoice: 'warm', primaryCTA: 'visit', languageCode: 'en', confidence: 0.95, insufficientData: false };
const COPY = { meta: { title: 'Harbour Bakery', description: 'Fresh bread in Sliema.' }, hero: { headline: 'Fresh bread every morning', subhead: 'Sourdough and coffee in Sliema.', ctaLabel: 'Visit us' }, about: { heading: 'About', body: 'Harbour Bakery bakes small batches every morning for the people of Sliema. Everything is made by hand and the coffee comes from a neighbour. Drop in early for the best choice or order ahead for larger occasions and celebrations.' }, services: [{ name: 'Sourdough', description: 'Slow-fermented loaves baked fresh each morning with a crust that stays crisp all day long.' }], whyUs: [{ title: 'Baked daily', body: 'Nothing sits overnight.' }], cta: { heading: 'Come in early', body: 'The best selection goes before nine.', buttonLabel: 'Get directions' }, placeholdersUsed: [] };

describe('Style gallery, listing photos and brand palette (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let builder: FakeSiteBuilder;
  let photoCalls: string[] = [];

  beforeAll(async () => {
    builder = new FakeSiteBuilder();
    app = await createTestApp((b) => b.overrideProvider(AstroSiteBuilder).useValue(builder).overrideProvider(PLACES_CLIENT).useValue({ details: async () => { throw new Error('offline'); }, searchNearby: async () => [] }));
    prisma = app.get(PrismaService);
    const llm = new FakeLlmClient();
    llm.respond = () => JSON.stringify(COPY);
    app.get(LlmService).setClient(llm);
    app.get(GeneratorService).setImageSource({ search: async () => [] });
    // Fake Google photo endpoint + a solid red JPEG so the palette is predictable.
    const env = app.get<any>(ENV);
    env.GOOGLE_MAPS_API_KEY = 'test-key';
    env.USE_PLACE_PHOTOS = true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp');
    const red = await sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 190, g: 30, b: 50 } } }).jpeg().toBuffer();
    app.get(PlacePhotosService).fetchFn = async (url: string) => {
      photoCalls.push(url);
      if (url.includes('/media?')) return new Response(JSON.stringify({ name: 'x', photoUri: 'https://lh3.test/photo.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(red, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };
  });
  afterAll(() => closeTestApp(app));

  async function profiledLead() {
    const lead = await makeLead(prisma, { businessName: 'Harbour Bakery Ltd' });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'profiled', classification: CLASSIFICATION, vertical: 'bakery', city: 'Sliema' } });
    await prisma.placeSnapshot.create({ data: { placeId: lead.placeId, kind: 'details', raw: { id: lead.placeId, photos: [{ name: `places/${lead.placeId}/photos/p1`, authorAttributions: [{ displayName: 'Harbour Bakery', uri: 'https://maps.google.com/x' }] }, { name: `places/${lead.placeId}/photos/p2`, authorAttributions: [] }] }, expiresAt: new Date(Date.now() + 10 * 86400_000) } });
    return lead;
  }

  it('uses the listing photos (with attribution) and derives a brand palette; the default scheme becomes "brand"', async () => {
    const lead = await profiledLead();
    const r = await app.get(GeneratorService).generate(lead.id, { advance: false });
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(photoCalls.filter((u) => u.includes('/media?')).length).toBe(2);
    expect(photoCalls.some((u) => u.includes('skipHttpRedirect=true'))).toBe(true);
    const images = r.site.images as any[];
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ source: 'google_places', placeholder: true, credit: 'Harbour Bakery via Google Maps' });
    expect(images[0].url).toContain(`/p/${r.site.previewSlug}/photos/0.jpg`);
    const brand = r.site.brand as any;
    expect(brand.source).toBe('photos');
    expect(brand.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(r.site.colourScheme).toBe('brand');
    expect(builder.builds.at(-1)!.brand).toEqual(brand);
    expect(await prisma.costEvent.count({ where: { category: 'images', leadId: lead.id } })).toBe(2);
    // photos are served before publishing (operator previews styles), pages are not
    await request(app.getHttpServer()).get(`/p/${r.site.previewSlug}/photos/0.jpg`).expect(200).expect('content-type', /image\/jpeg/);
    await request(app.getHttpServer()).get(`/p/${r.site.previewSlug}`).expect(404);
    // rebuild reuses stored photos: no new Google calls
    const before = photoCalls.length;
    await app.get(GeneratorService).generate(lead.id, { advance: false, colourScheme: 'b' });
    expect(photoCalls.length).toBe(before);
    expect((await prisma.generatedSite.findUnique({ where: { leadId: lead.id } }))!.colourScheme).toBe('b');
  });

  it('exposes every style variant per lead, cached after the first build, and rejects unprofiled leads', async () => {
    const lead = await profiledLead();
    const v = await request(app.getHttpServer()).get(`/admin/leads/${lead.id}/site/variants`).set(AUTH).expect(200);
    expect(v.body.templates).toHaveLength(10);
    expect(v.body.colourSchemes).toEqual(['a', 'b', 'c', 'brand', 'brand2', 'brand3']);
    expect(v.body.typography).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(v.body.brand.source).toBe('photos');
    expect(v.body.images).toHaveLength(2);
    expect(v.body.current).toBeNull();
    const buildsBefore = builder.builds.length;
    const html = await request(app.getHttpServer()).get(`/admin/leads/${lead.id}/site/variant?template=trades&colourScheme=brand&typography=b`).set(AUTH).expect(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(builder.builds.at(-1)).toMatchObject({ template: 'trades', colourScheme: 'brand', typography: 'b' });
    expect(html.headers['x-robots-tag']).toContain('noindex');
    await request(app.getHttpServer()).get(`/admin/leads/${lead.id}/site/variant?template=trades&colourScheme=brand&typography=b`).set(AUTH).expect(200);
    expect(builder.builds.length).toBe(buildsBefore + 1); // second call served from cache
    await request(app.getHttpServer()).get(`/admin/leads/${lead.id}/site/variant?template=nope&colourScheme=a&typography=a`).set(AUTH).expect(422);
    const raw = await makeLead(prisma);
    await request(app.getHttpServer()).get(`/admin/leads/${raw.id}/site/variants`).set(AUTH).expect(422);
    // adopting a style through the existing rebuild endpoint
    await request(app.getHttpServer()).post(`/admin/leads/${lead.id}/site/rebuild`).set(AUTH).send({ templateId: 'trades', colourScheme: 'brand', typography: 'b' }).expect(201);
  });

  it('proposal page carries the preview toolbar and NFC tags per plan; provisioning records the tag count', async () => {
    const lead = await profiledLead();
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'generated', primaryType: 'bakery', reviewCount: 30 } });
    const site = await app.get(GeneratorService).generate(lead.id, { advance: false });
    if (site.skipped) throw new Error('skipped');
    await prisma.generatedSite.update({ where: { leadId: lead.id }, data: { previewUrl: `http://localhost:3000/p/${site.site.previewSlug}`, publishedAt: new Date(), objectPrefix: `previews/${site.site.previewSlug}/` } });
    const quote = await app.get(QuotingService).createQuote(lead.id, { addOns: ['nfcTagExtra', 'nfcTagExtra'] });
    const page = await request(app.getHttpServer()).get(`/q/${quote.slug}`).expect(200);
    expect(page.text).toContain('id="pb-mobile"');
    expect(page.text).toContain('id="pb-max"');
    expect(page.text).toContain('Google review + website NFC tags ×2 (included)');
    expect(page.text).toContain('Extra NFC tags ×2');
    expect(page.text).toContain('NFC tags available as an add-on'); // starter
  });
});
