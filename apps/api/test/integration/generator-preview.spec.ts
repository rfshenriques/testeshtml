import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { FakeSiteBuilder } from '../fake-builder';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AstroSiteBuilder } from '../../src/modules/generator/site-builder.service';
import { GeneratorService } from '../../src/modules/generator/generator.service';
import { PreviewService, assertMockupInvariants } from '../../src/modules/preview/preview.service';
import { LlmService, FakeLlmClient } from '../../src/shared/llm/llm.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { QueueRegistry } from '../../src/shared/queues/queue-registry.service';
import { LinkTokenService } from '../../src/modules/compliance/link-token.service';
import { hashEmail } from '../../src/modules/compliance/suppression.util';

const CLASSIFICATION = { vertical: 'dental', subVertical: 'family dentist', servicesOffered: ['check-ups', 'whitening', 'implants'], differentiators: ['gentle with children'], toneOfVoice: 'clinical', primaryCTA: 'book', languageCode: 'en', confidence: 0.95, insufficientData: false };
const GOOD_COPY = {
  meta: { title: 'Valletta Dental Clinic', description: 'Family dental care in Valletta. Book an appointment today.' },
  hero: { headline: 'Gentle dental care in Valletta', subhead: 'Check-ups, whitening and implants for the whole family.', ctaLabel: 'Book now' },
  about: { heading: 'About the clinic', body: 'Valletta Dental Clinic offers friendly, modern dental care for families in Valletta. Our team takes time to explain every option so you can make the right choice. Book a visit and see the difference a calm, careful approach makes to your smile and your confidence.' },
  services: [{ name: 'Check-ups', description: 'Routine examinations and cleaning to keep your teeth healthy, with clear advice on what comes next.' }, { name: 'Whitening', description: 'Professional whitening to brighten your smile safely, planned around your schedule and your sensitivity.' }, { name: 'Implants', description: 'Long-lasting replacements for missing teeth, planned carefully and fitted with precision.' }],
  whyUs: [{ title: 'Gentle approach', body: 'Patients tell us we are gentle with children and nervous adults alike.' }, { title: 'Clear advice', body: 'We explain your options plainly so there are no surprises.' }, { title: 'Central location', body: 'Easy to reach in the heart of Valletta.' }],
  cta: { heading: 'Ready to book?', body: 'Call or send a message and we will find a time that suits you.', buttonLabel: 'Book an appointment' },
  placeholdersUsed: ['team photos'],
};

describe('Generator + preview hosting (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let builder: FakeSiteBuilder;
  let llm: FakeLlmClient;
  let generator: GeneratorService;
  let preview: PreviewService;

  beforeAll(async () => {
    builder = new FakeSiteBuilder();
    app = await createTestApp((b) => b.overrideProvider(AstroSiteBuilder).useValue(builder).overrideProvider(PLACES_CLIENT).useValue({ details: async () => { throw new Error('no network'); }, searchNearby: async () => [] }));
    prisma = app.get(PrismaService);
    generator = app.get(GeneratorService);
    preview = app.get(PreviewService);
    llm = new FakeLlmClient();
    app.get(LlmService).setClient(llm);
    generator.setImageSource({ search: async () => [{ url: 'https://images.example/a.jpg', credit: 'Photo by A on Unsplash' }] });
  });
  afterAll(() => closeTestApp(app));

  async function profiledLead(name = 'Valletta Dental Clinic Ltd') {
    const lead = await makeLead(prisma, { businessName: name });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'profiled', classification: CLASSIFICATION, vertical: 'dental', lat: 35.8989, lng: 14.5146 } });
    return lead;
  }

  it('generates a site: template from vertical, guarded copy, 22-char slug, stage generated, publish enqueued', async () => {
    const lead = await profiledLead();
    let calls = 0;
    llm.respond = (req) => {
      calls++;
      if (req.user.includes('Rewrite ONLY the field')) return JSON.stringify({ value: 'Modern dental care for families in Valletta.' });
      return JSON.stringify({ ...GOOD_COPY, hero: { ...GOOD_COPY.hero, subhead: 'Award-winning care since 1998 for the whole family.' }, cta: { ...GOOD_COPY.cta, body: 'Satisfaction guaranteed, call today.' } });
    };
    // second regeneration (cta.body) also fails the guard → neutral fallback
    const orig = llm.respond;
    llm.respond = (req) => (req.user.includes('"cta.body"') ? JSON.stringify({ value: 'We guarantee you will love it.' }) : orig(req));
    const r = await generator.generate(lead.id);
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(r.site.templateId).toBe('clinic');
    expect(r.site.previewSlug).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(r.site.previewSlug.toLowerCase()).not.toContain('valletta');
    const copy = r.site.copy as any;
    expect(copy.hero.subhead).toBe('Modern dental care for families in Valletta.');
    expect(copy.cta.body).toBe('Contact Valletta Dental Clinic Ltd today.');
    expect(copy.placeholdersUsed).toContain('cta.body');
    expect(r.violations.map((v) => v.pattern)).toEqual(expect.arrayContaining(['award', 'guarantee']));
    expect(calls).toBe(2);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.stage).toBe('generated');
    expect(await prisma.leadEvent.count({ where: { leadId: lead.id, type: 'copy.violation' } })).toBeGreaterThanOrEqual(2);
    const input = builder.builds.at(-1)!;
    expect(input.images[0].placeholder).toBe(true);
    expect(input.mockup.formEndpoint).toContain(`/p/${r.site.previewSlug}/form`);
    expect(input.mockup.mapEmbedUrl).toContain('output=embed');
    const q = app.get(QueueRegistry).get('previewPublish');
    expect((await q.getJobCounts('waiting', 'delayed')).waiting).toBeGreaterThan(0);
    // rebuild reuses copy and slug; deterministic hash
    const again = await generator.generate(lead.id, { advance: false });
    expect(again.skipped).toBe(false);
    if (!again.skipped) {
      expect(again.site.previewSlug).toBe(r.site.previewSlug);
      expect(again.site.buildHash).toBe(r.site.buildHash);
      expect(llm.calls.length).toBe(3);
    }
  });

  it('a gate-blocked lead gets no mockup', async () => {
    const lead = await profiledLead('Maria Borg');
    await prisma.lead.update({ where: { id: lead.id }, data: { reviewCount: 2 } });
    const r = await generator.generate(lead.id);
    expect(r).toEqual({ skipped: true, reason: 'individual subscriber' });
    expect(await prisma.generatedSite.findUnique({ where: { leadId: lead.id } })).toBeNull();
  });

  it('publishes to object storage and serves with noindex + cache headers; 404 for unknown; robots.txt disallows all', async () => {
    const lead = await profiledLead();
    llm.respond = () => JSON.stringify(GOOD_COPY);
    const r = await generator.generate(lead.id, { advance: false });
    if (r.skipped) throw new Error('skipped');
    const pub = await preview.publish(lead.id);
    expect(pub.files).toBe(3);
    const site = await prisma.generatedSite.findUnique({ where: { leadId: lead.id } });
    expect(site!.previewUrl).toBe(`http://localhost:3000/p/${site!.previewSlug}`);
    const res = await request(app.getHttpServer()).get(`/p/${site!.previewSlug}`).set('user-agent', 'ua-1').expect(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Unofficial concept mockup prepared by Test Studio');
    const css = await request(app.getHttpServer()).get(`/p/${site!.previewSlug}/style.css`).expect(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    await request(app.getHttpServer()).get(`/p/${site!.previewSlug}/about/`).expect(200);
    await request(app.getHttpServer()).get(`/p/${site!.previewSlug}/about`).expect(200);
    await request(app.getHttpServer()).head(`/p/${site!.previewSlug}`).expect(200);
    await request(app.getHttpServer()).get(`/p/${site!.previewSlug}/nope.png`).expect(404);
    await request(app.getHttpServer()).get('/p/doesnotexist0000000000').expect(404);
    const robots = await request(app.getHttpServer()).get('/robots.txt').expect(200);
    expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
  });

  it('tracks views deduped by IP+UA within 30 min, raises priority and alerts the operator on first view', async () => {
    const site = (await prisma.generatedSite.findFirst({ where: { publishedAt: { not: null }, takenDownAt: null }, orderBy: { publishedAt: 'desc' } }))!;
    const before = await prisma.lead.findUnique({ where: { id: site.leadId } });
    const viewsBefore = site.views;
    await request(app.getHttpServer()).get(`/p/${site.previewSlug}`).set('user-agent', 'ua-view').set('x-forwarded-for', '203.0.113.5').expect(200);
    await request(app.getHttpServer()).get(`/p/${site.previewSlug}`).set('user-agent', 'ua-view').set('x-forwarded-for', '203.0.113.5').expect(200);
    await request(app.getHttpServer()).get(`/p/${site.previewSlug}/style.css`).set('user-agent', 'ua-other').set('x-forwarded-for', '203.0.113.9').expect(200);
    let after = await prisma.generatedSite.findUnique({ where: { id: site.id } });
    expect(after!.views).toBe(viewsBefore + 1);
    await request(app.getHttpServer()).get(`/p/${site.previewSlug}`).set('user-agent', 'ua-other').set('x-forwarded-for', '203.0.113.9').expect(200);
    after = await prisma.generatedSite.findUnique({ where: { id: site.id } });
    expect(after!.views).toBe(viewsBefore + 2);
    const lead = await prisma.lead.findUnique({ where: { id: site.leadId } });
    expect(lead!.priority).toBeGreaterThan(before!.priority);
    expect(await prisma.alert.count({ where: { kind: 'preview_viewed' } })).toBeGreaterThan(0);
    expect(await prisma.leadEvent.count({ where: { leadId: site.leadId, type: 'preview.viewed' } })).toBeGreaterThanOrEqual(2);
  });

  it('the contact form is captured (not forwarded) before conversion', async () => {
    const site = (await prisma.generatedSite.findFirst({ where: { publishedAt: { not: null }, takenDownAt: null } }))!;
    const r = await request(app.getHttpServer()).post(`/p/${site.previewSlug}/form`).send({ name: 'Ann', email: 'ann@example.com', message: 'hi' }).expect(200);
    expect(r.body).toEqual({ ok: true, mockup: true });
    const sub = await prisma.formSubmission.findFirst({ where: { siteId: site.id } });
    expect(sub!.forwarded).toBe(false);
    const html = await request(app.getHttpServer()).post(`/p/${site.previewSlug}/form`).type('form').send('name=Bob').set('accept', 'text/html').expect(200);
    expect(html.text).toContain('mockup');
  });

  it('takedown link hard-deletes objects, returns 410 afterwards, and suppresses the business', async () => {
    const site = (await prisma.generatedSite.findFirst({ where: { publishedAt: { not: null }, takenDownAt: null }, include: { lead: { include: { contacts: true } } } }))!;
    const token = app.get(LinkTokenService).sign({ p: 'takedown', leadId: site.leadId });
    const res = await request(app.getHttpServer()).get(`/takedown/${token}`).expect(200);
    expect(res.text).toContain('deleted');
    await request(app.getHttpServer()).get(`/p/${site.previewSlug}`).expect(410);
    const keys = await (preview as any).storage.list(`previews/${site.previewSlug}/`);
    expect(keys).toEqual([]);
    expect(await prisma.suppression.findUnique({ where: { placeId: site.lead.placeId } })).toBeTruthy();
    expect(await prisma.suppression.findUnique({ where: { emailHash: hashEmail(site.lead.contacts[0].email) } })).toBeTruthy();
    expect((await prisma.lead.findUnique({ where: { id: site.leadId } }))!.stage).toBe('suppressed');
    await expect(preview.publish(site.leadId)).rejects.toThrow(/suppressed/);
    await request(app.getHttpServer()).get('/takedown/bad-token').expect(200);
  });

  it('expired previews return 410 with the expiry page and their objects are purged nightly', async () => {
    const lead = await profiledLead();
    llm.respond = () => JSON.stringify(GOOD_COPY);
    await generator.generate(lead.id, { advance: false });
    await preview.publish(lead.id);
    const site = (await prisma.generatedSite.findUnique({ where: { leadId: lead.id } }))!;
    await prisma.generatedSite.update({ where: { id: site.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app.getHttpServer()).get(`/p/${site.previewSlug}`).expect(410);
    expect(res.text).toContain('expired');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(await preview.expireSites()).toBe(1);
    expect(await (preview as any).storage.list(`previews/${site.previewSlug}/`)).toEqual([]);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.stage).not.toBe('suppressed'); // expiry is not an objection
  });

  it('refuses to publish a build without noindex, banner or data-placeholder images', async () => {
    const lead = await profiledLead();
    llm.respond = () => JSON.stringify(GOOD_COPY);
    builder.omit = { noindex: true };
    await generator.generate(lead.id, { advance: false });
    await expect(preview.publish(lead.id)).rejects.toThrow(/noindex/);
    builder.omit = { banner: true };
    await generator.generate(lead.id, { advance: false });
    await expect(preview.publish(lead.id)).rejects.toThrow(/banner/);
    builder.omit = { placeholder: true };
    await generator.generate(lead.id, { advance: false });
    await expect(preview.publish(lead.id)).rejects.toThrow(/data-placeholder/);
    builder.omit = {};
    expect(() => assertMockupInvariants('<html><meta name="robots" content="noindex,nofollow"><div>Unofficial concept mockup prepared by Test Studio</div><img data-placeholder="true" alt=""></html>', 'Test Studio')).not.toThrow();
  });

  it('admin: templates list, site record, copy edit with guard + rebuild enqueue, local files', async () => {
    const t = await request(app.getHttpServer()).get('/admin/generator/templates').set(AUTH).expect(200);
    expect(t.body).toHaveLength(10);
    expect(t.body.find((x: any) => x.id === 'clinic').verticals).toContain('dental');
    const site = (await prisma.generatedSite.findFirst({ where: { takenDownAt: null, buildPath: { not: null } } }))!;
    await request(app.getHttpServer()).get(`/admin/leads/${site.leadId}/site`).set(AUTH).expect(200);
    const edit = await request(app.getHttpServer()).put(`/admin/leads/${site.leadId}/site/copy`).set(AUTH).send({ copy: { ...GOOD_COPY, hero: { ...GOOD_COPY.hero, headline: 'Voted best dentist' } } }).expect(200);
    expect(edit.body.violations[0].pattern).toBe('voted');
    const html = await request(app.getHttpServer()).get(`/admin/leads/${site.leadId}/site/files/index.html`).set(AUTH).expect(200);
    expect(html.text).toContain('concept mockup');
    const builds = await request(app.getHttpServer()).get('/admin/generator/builds').set(AUTH).expect(200);
    expect(builds.body.length).toBeGreaterThan(0);
    await fs.rm(process.env.LOCAL_STORAGE_DIR!, { recursive: true, force: true });
  });
});
