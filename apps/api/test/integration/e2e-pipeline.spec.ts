import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'node:fs';
import { closeTestApp, createTestApp, makeLead } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { GeneratorService } from '../../src/modules/generator/generator.service';
import { PreviewService } from '../../src/modules/preview/preview.service';
import { LlmService, FakeLlmClient } from '../../src/shared/llm/llm.service';
import { AstroSiteBuilder } from '../../src/modules/generator/site-builder.service';

const COPY = {
  meta: { title: 'Harbour Bakery', description: 'Fresh bread and pastries in Sliema every morning.' },
  hero: { headline: 'Fresh bread every morning', subhead: 'Sourdough, pastries and coffee in the heart of Sliema.', ctaLabel: 'Visit us' },
  about: { heading: 'About the bakery', body: 'Harbour Bakery bakes small batches every morning for the people of Sliema. Everything is made by hand, from the sourdough to the pastries, and the coffee is roasted by a neighbour down the road. Drop in early for the best choice, or order ahead for larger occasions.' },
  services: [{ name: 'Sourdough', description: 'Slow-fermented loaves baked fresh each morning, with a crust that stays crisp all day.' }, { name: 'Pastries', description: 'Croissants, cinnamon rolls and seasonal specials, made with butter and patience.' }, { name: 'Coffee', description: 'Locally roasted espresso and filter coffee to go with your morning pastry.' }],
  whyUs: [{ title: 'Baked daily', body: 'Nothing sits overnight; what you buy was baked that morning.' }, { title: 'Local', body: 'Ingredients from Maltese producers wherever possible.' }, { title: 'Friendly', body: 'A neighbourhood bakery that knows your usual.' }],
  cta: { heading: 'Come in early', body: 'The best selection goes before nine. See you tomorrow morning.', buttonLabel: 'Get directions' },
  placeholdersUsed: ['gallery photos'],
};

/** Real Astro build through the templates workspace (spec M5: deterministic output under 20 s), served through preview hosting. */
describe('End-to-end: profile → generate (real Astro build) → publish → serve', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp((b) => b.overrideProvider(PLACES_CLIENT).useValue({ details: async () => { throw new Error('offline'); }, searchNearby: async () => [] }));
    prisma = app.get(PrismaService);
    const llm = new FakeLlmClient();
    llm.respond = () => JSON.stringify(COPY);
    app.get(LlmService).setClient(llm);
    app.get(GeneratorService).setImageSource({ search: async () => [] });
  });
  afterAll(() => closeTestApp(app));

  it('builds a real template site deterministically and serves it with every mockup invariant', async () => {
    expect(fs.existsSync(`${app.get(AstroSiteBuilder).templatesDir}/scripts/build-site.ts`)).toBe(true);
    const lead = await makeLead(prisma, { businessName: 'Harbour Bakery Ltd' });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'profiled', vertical: 'bakery', primaryType: 'bakery', city: 'Sliema', lat: 35.9122, lng: 14.5042, classification: { vertical: 'bakery', subVertical: 'artisan bakery', servicesOffered: ['sourdough', 'pastries', 'coffee'], differentiators: ['baked daily'], toneOfVoice: 'warm', primaryCTA: 'visit', languageCode: 'en', confidence: 0.95, insufficientData: false } } });
    const t0 = Date.now();
    const r = await app.get(GeneratorService).generate(lead.id, { advance: false });
    const ms = Date.now() - t0;
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(ms).toBeLessThan(20_000);
    expect(r.site.templateId).toBe('hospitality');
    expect(r.build.files).toContain('index.html');
    const r2 = await app.get(GeneratorService).generate(lead.id, { advance: false });
    if (!r2.skipped) expect(r2.site.buildHash).toBe(r.site.buildHash);

    await app.get(PreviewService).publish(lead.id);
    const res = await request(app.getHttpServer()).get(`/p/${r.site.previewSlug}`).expect(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(res.text).toMatch(/<meta\s+name="robots"\s+content="noindex,\s*nofollow"/i);
    expect(res.text).toContain('Unofficial concept mockup prepared by');
    expect(res.text).toContain('Harbour Bakery Ltd');
    expect(res.text).toContain('Fresh bread every morning');
    expect(res.text).toContain('application/ld+json');
    expect(res.text).toContain(`/p/${r.site.previewSlug}/form`);
    expect(res.text).toContain('/takedown/');
    expect(res.text).not.toMatch(/<img(?![^>]*data-placeholder="true")[^>]*>/i);
    expect(res.text).not.toMatch(/<script\s+src=/i);
  }, 120_000);
});
