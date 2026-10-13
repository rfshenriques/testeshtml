import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ReadinessService } from '../../src/modules/ops/readiness.service';

describe('Go-live readiness (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    app.get(ReadinessService).dnsCheck = async () => ({ mx: true, spf: 'v=spf1 include:amazonses.com ~all', dmarc: 'v=DMARC1; p=quarantine', dkim: true });
  });
  afterAll(() => closeTestApp(app));

  it('reports every blocker with a fix in the test environment (fake providers), and reads sending domains', async () => {
    const r = await request(app.getHttpServer()).get('/admin/ops/readiness').set(AUTH).expect(200);
    expect(r.body.ready).toBe(false);
    const byKey = Object.fromEntries(r.body.items.map((i: any) => [i.key, i]));
    expect(byKey.email.status).toBe('blocker');
    expect(byKey.verifier.status).toBe('blocker');
    expect(byKey.verifier.fix).toMatch(/EMAIL_VERIFY_PROVIDER/);
    expect(byKey.domain.status).toBe('blocker');
    for (const i of r.body.items.filter((x: any) => x.status !== 'ok')) expect(i.fix).toBeTruthy();
    // With a real domain + mailbox the domain row turns green (DNS stubbed) and mailboxes are described.
    const { MailboxService } = await import('../../src/modules/outreach/mailbox.service');
    const mailboxes = app.get(MailboxService);
    await mailboxes.addDomain('get-agency.example', 'test');
    await mailboxes.addMailbox('anna@get-agency.example', 'get-agency.example', 'test');
    const r2 = await request(app.getHttpServer()).get('/admin/ops/readiness').set(AUTH).expect(200);
    const k2 = Object.fromEntries(r2.body.items.map((i: any) => [i.key, i]));
    expect(k2['domain:get-agency.example'].status).toBe('ok');
    expect(k2.mailboxes.detail).toContain('anna@get-agency.example');
    expect(k2.mailboxes.detail).toContain('warm-up week 1');
  });

  it('purges demo data only and is idempotent', async () => {
    await prisma.campaign.create({ data: { name: 'Somewhere (demo)', countryCode: 'MT', geometry: { kind: 'bbox', bbox: [14.4, 35.85, 14.6, 35.95] }, includedTypes: ['dentist'], excludedTypes: [], budgetUsdCap: 10, status: 'complete' } });
    const keep = await prisma.campaign.create({ data: { name: 'Real campaign', countryCode: 'MT', geometry: { kind: 'bbox', bbox: [14.4, 35.85, 14.6, 35.95] }, includedTypes: ['dentist'], excludedTypes: [], budgetUsdCap: 10, status: 'draft' } });
    const before = await request(app.getHttpServer()).get('/admin/ops/readiness').set(AUTH).expect(200);
    expect(before.body.items.find((i: any) => i.key === 'demo')?.action).toBe('purge-demo');
    const r = await request(app.getHttpServer()).post('/admin/ops/purge-demo').set(AUTH).expect(201);
    expect(r.body.campaigns).toBe(1);
    expect(await prisma.campaign.findUnique({ where: { id: keep.id } })).not.toBeNull();
    expect(await prisma.campaign.count({ where: { name: { contains: '(demo)' } } })).toBe(0);
    const again = await request(app.getHttpServer()).post('/admin/ops/purge-demo').set(AUTH).expect(201);
    expect(again.body.campaigns).toBe(0);
    const after = await request(app.getHttpServer()).get('/admin/ops/readiness').set(AUTH).expect(200);
    expect(after.body.items.find((i: any) => i.key === 'demo')).toBeUndefined();
  });
});

describe('Prospect tiers (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => { app = await createTestApp(); prisma = app.get(PrismaService); });
  afterAll(() => closeTestApp(app));

  it('tiers leads by email + photos, counts them per country and engages a phone-only lead into generation', async () => {
    const { makeLead } = await import('../helpers');
    const a = await makeLead(prisma, { businessName: 'A With Email And Photos' });
    await prisma.lead.update({ where: { id: a.id }, data: { photoCount: 4, phone: '+356 2100 0001' } });
    const b = await makeLead(prisma, { businessName: 'B Photos No Email' });
    await prisma.contact.deleteMany({ where: { leadId: b.id } });
    await prisma.lead.update({ where: { id: b.id }, data: { photoCount: 2, stage: 'qualified', phone: '+356 2100 0000' } });
    const c = await makeLead(prisma, { businessName: 'C Nothing', countryCode: 'PT' });
    await prisma.contact.deleteMany({ where: { leadId: c.id } });
    const list = await request(app.getHttpServer()).get('/admin/leads?tier=a').set(AUTH).expect(200);
    expect(list.body.items.map((l: any) => l.businessName)).toEqual(['A With Email And Photos']);
    expect(list.body.items[0].tier).toBe('a');
    expect(list.body.items[0].photoCount).toBe(4);
    const tb = await request(app.getHttpServer()).get('/admin/leads?tier=b').set(AUTH).expect(200);
    expect(tb.body.items.map((l: any) => l.tier)).toEqual(['b']);
    const tc = await request(app.getHttpServer()).get('/admin/leads?tier=c&countryCode=PT').set(AUTH).expect(200);
    expect(tc.body.items.map((l: any) => l.businessName)).toEqual(['C Nothing']);
    const p = await request(app.getHttpServer()).get('/admin/leads/prospects').set(AUTH).expect(200);
    const mt = p.body.countries.find((x: any) => x.countryCode === 'MT');
    expect(mt).toMatchObject({ total: 2, tierA: 1, tierB: 1, tierC: 0, withEmail: 1, withPhone: 2, withPhotos: 2 });
    // Engage: a qualified lead without email moves to enriched (phone bucket) and gets a profiling job.
    const r = await request(app.getHttpServer()).post(`/admin/leads/${b.id}/actions/engage`).set(AUTH).send({}).expect(201);
    expect(r.body.ok).toBe(true);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.stage).toBe('enriched');
    const { QueueRegistry } = await import('../../src/shared/queues/queue-registry.service');
    const waiting = await app.get(QueueRegistry).get('profilingClassify').getJobs(['waiting', 'delayed', 'active', 'prioritized']);
    expect(waiting.some((j) => j.data.leadId === b.id)).toBe(true);
  });
});
