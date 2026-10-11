import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { GateService } from '../../src/modules/compliance/gate.service';
import { SuppressionService } from '../../src/modules/compliance/suppression.service';
import { LinkTokenService } from '../../src/modules/compliance/link-token.service';
import { RetentionService } from '../../src/modules/compliance/retention.service';
import { hashEmail } from '../../src/modules/compliance/suppression.util';

describe('Compliance module (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gate: GateService;
  let suppression: SuppressionService;
  let links: LinkTokenService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    gate = app.get(GateService);
    suppression = app.get(SuppressionService);
    links = app.get(LinkTokenService);
  });
  afterAll(() => closeTestApp(app));

  it('seeded jurisdictions are served and a missing country is blocked', async () => {
    const res = await request(app.getHttpServer()).get('/admin/compliance/jurisdictions').set(AUTH).expect(200);
    expect(res.body.find((j: any) => j.countryCode === 'DE').priorConsentRequired).toBe(true);
    const lead = await makeLead(prisma, { countryCode: 'XX' });
    const r = await gate.evaluate(lead.id);
    expect(r).toMatchObject({ result: 'blocked', reason: 'no policy for country' });
    const persisted = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(persisted!.legalGate).toBe('blocked');
  });

  it('a compliant Maltese corporate lead clears the gate and the decision is audited', async () => {
    const lead = await makeLead(prisma);
    const r = await gate.assertClear(lead.id);
    expect(r.result).toBe('clear');
    const audit = await prisma.auditLog.findMany({ where: { leadId: lead.id, action: 'gate.evaluated' } });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('a blocked sole-trader lead opens a review item; override with justification clears it and is logged', async () => {
    const lead = await makeLead(prisma, { businessName: 'Maria Borg', reviewCount: 3 });
    const r = await gate.evaluate(lead.id);
    expect(r.reason).toBe('individual subscriber');
    const item = await prisma.reviewItem.findFirst({ where: { leadId: lead.id, type: 'legal_gate_block', status: 'open' } });
    expect(item).toBeTruthy();

    await request(app.getHttpServer()).post(`/admin/compliance/leads/${lead.id}/gate/override`).set(AUTH).send({ reason: 'individual subscriber', justification: 'short' }).expect(403);
    const ok = await request(app.getHttpServer())
      .post(`/admin/compliance/leads/${lead.id}/gate/override`).set(AUTH)
      .send({ reason: 'individual subscriber', justification: 'Confirmed as a registered company (MBR C99999) by phone with the owner.' })
      .expect(201);
    expect(ok.body.result).toBe('clear');
    expect(ok.body.overridden).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { leadId: lead.id, action: 'gate.overridden' } });
    expect(audit!.actor).toBe('operator');
    const resolved = await prisma.reviewItem.findUnique({ where: { id: item!.id } });
    expect(resolved!.status).toBe('approved');
  });

  it('suppression can never be overridden', async () => {
    const lead = await makeLead(prisma);
    await suppression.add({ email: lead.contacts[0].email, reason: 'operator', actor: 'operator', cascade: false });
    await request(app.getHttpServer())
      .post(`/admin/compliance/leads/${lead.id}/gate/override`).set(AUTH)
      .send({ reason: 'suppressed', justification: 'they said it was fine, honestly, really they did' })
      .expect(403);
    await expect(gate.assertClear(lead.id)).rejects.toThrow(/suppressed/);
  });

  it('GET /u/:token writes suppression synchronously before returning 200, and the lead becomes terminal', async () => {
    const lead = await makeLead(prisma);
    const token = links.sign({ p: 'unsubscribe', leadId: lead.id, contactId: lead.contacts[0].id });
    const res = await request(app.getHttpServer()).get(`/u/${token}`).expect(200);
    expect(res.text).toContain('unsubscribed');
    // Immediately after the response, the suppression rows exist (no async queue in between).
    const row = await prisma.suppression.findUnique({ where: { emailHash: hashEmail(lead.contacts[0].email) } });
    expect(row?.reason).toBe('unsubscribe');
    const place = await prisma.suppression.findUnique({ where: { placeId: lead.placeId } });
    expect(place).toBeTruthy();
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after!.stage).toBe('suppressed');
    expect((await gate.evaluate(lead.id)).reason).toBe('suppressed');
    // One-click POST (RFC 8058) is idempotent.
    await request(app.getHttpServer()).post(`/u/${token}`).send('List-Unsubscribe=One-Click').expect(200);
    await request(app.getHttpServer()).get('/u/not-a-token').expect(200);
  });

  it('suppression matches by email, by place id and by registrable domain (but never by public mailbox domains)', async () => {
    await suppression.add({ email: 'owner@bluelagoon-restaurant.com', reason: 'hostile_reply', actor: 'test' });
    expect((await suppression.isSuppressed({ email: 'OWNER@BlueLagoon-Restaurant.com' })).suppressed).toBe(true);
    expect((await suppression.isSuppressed({ email: 'other@bluelagoon-restaurant.com' })).suppressed).toBe(true); // domain cascade
    await suppression.add({ email: 'someone@gmail.com', reason: 'unsubscribe', actor: 'test' });
    expect((await suppression.isSuppressed({ email: 'someone@gmail.com' })).suppressed).toBe(true);
    expect((await suppression.isSuppressed({ email: 'someone-else@gmail.com' })).suppressed).toBe(false);
    const gmailDomainRows = await prisma.suppression.count({ where: { domain: 'gmail.com' } });
    expect(gmailDomainRows).toBe(0);
  });

  it('the admin suppression API is add/search only', async () => {
    await request(app.getHttpServer()).post('/admin/compliance/suppressions').set(AUTH).send({ placeId: 'ChIJ-test', reason: 'operator', note: 'asked by phone' }).expect(201);
    const list = await request(app.getHttpServer()).get('/admin/compliance/suppressions?placeId=ChIJ-test').set(AUTH).expect(200);
    expect(list.body.items).toHaveLength(1);
    await request(app.getHttpServer()).delete('/admin/compliance/suppressions/' + list.body.items[0].id).set(AUTH).expect(404);
  });

  it('retention purges expired snapshots, unengaged contact data and old objections', async () => {
    const retention = app.get(RetentionService);
    const now = new Date();
    const lead = await makeLead(prisma);
    await prisma.placeSnapshot.create({ data: { placeId: lead.placeId, kind: 'search', raw: {}, expiresAt: new Date(now.getTime() - 1000) } });
    await prisma.placeSnapshot.create({ data: { placeId: lead.placeId, kind: 'details', raw: {}, expiresAt: new Date(now.getTime() + 86400_000) } });
    await prisma.lead.update({ where: { id: lead.id }, data: { lastTouchAt: new Date(now.getTime() - 91 * 86400_000) } });
    const objector = await makeLead(prisma);
    await suppression.suppressLead(objector.id, 'objection', { actor: 'test' });
    await prisma.$executeRaw`UPDATE "Lead" SET "updatedAt" = ${new Date(now.getTime() - 31 * 86400_000)} WHERE id = ${objector.id}`;

    const result = await retention.runAll(now);
    expect(result.snapshots).toBe(1);
    expect(result.unengaged).toBeGreaterThanOrEqual(1);
    expect(result.objections).toBeGreaterThanOrEqual(1);
    expect(await prisma.contact.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.contact.count({ where: { leadId: objector.id } })).toBe(0);
    expect((await prisma.lead.findUnique({ where: { id: objector.id } }))!.businessName).toBe('[purged]');
    // suppression hashes survive the purge
    expect((await suppression.isSuppressed({ email: objector.contacts[0].email })).suppressed).toBe(true);
    expect(await prisma.placeRef.count({ where: { placeId: lead.placeId } })).toBe(1);
    const status = await request(app.getHttpServer()).get('/admin/compliance/retention').set(AUTH).expect(200);
    expect(status.body.lastRun).toBeTruthy();
  });

  it('jurisdiction edits are audited and the opt-out window is capped at 72h', async () => {
    const body = { b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false, requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 24, defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: 'test edit', confirmedByCounsel: true };
    await request(app.getHttpServer()).put('/admin/compliance/jurisdictions/mt').set(AUTH).send(body).expect(200);
    const audit = await request(app.getHttpServer()).get('/admin/compliance/audit?action=jurisdiction').set(AUTH).expect(200);
    expect(audit.body[0].subjectId).toBe('MT');
    await request(app.getHttpServer()).put('/admin/compliance/jurisdictions/mt').set(AUTH).send({ ...body, optOutHonourWindowHours: 100 }).expect(500);
  });
});
