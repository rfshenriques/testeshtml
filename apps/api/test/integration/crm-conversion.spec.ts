import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { StripeService, FakePaymentGateway } from '../../src/modules/quoting/stripe.service';
import { QuotingService } from '../../src/modules/quoting/quoting.service';
import { QueueRegistry } from '../../src/shared/queues/queue-registry.service';
import { addBusinessDays } from '../../src/modules/billing/billing.service';

describe('CRM, dashboard, conversion and billing (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: FakePaymentGateway;

  beforeAll(async () => {
    app = await createTestApp((b) => b.overrideProvider(PLACES_CLIENT).useValue({}));
    prisma = app.get(PrismaService);
    gateway = new FakePaymentGateway();
    app.get(StripeService).setGateway(gateway);
  });
  afterAll(() => closeTestApp(app));

  it('leads list: filters, sorting, cursor pagination; detail; patch; actions and bulk actions', async () => {
    const a = await makeLead(prisma, { businessName: 'Alpha Dental Ltd' });
    const b = await makeLead(prisma, { businessName: 'Beta Plumbing Ltd' });
    await prisma.lead.update({ where: { id: a.id }, data: { score: 0.9, vertical: 'dental' } });
    await prisma.lead.update({ where: { id: b.id }, data: { score: 0.5, vertical: 'trades', websiteStatus: 'social_only' } });
    const page1 = await request(app.getHttpServer()).get('/admin/leads?take=1&sort=score&dir=desc').set(AUTH).expect(200);
    expect(page1.body.items[0].businessName).toBe('Alpha Dental Ltd');
    expect(page1.body.total).toBe(2);
    expect(page1.body.nextCursor).toBe(a.id);
    const page2 = await request(app.getHttpServer()).get(`/admin/leads?take=1&sort=score&dir=desc&cursor=${page1.body.nextCursor}`).set(AUTH).expect(200);
    expect(page2.body.items[0].businessName).toBe('Beta Plumbing Ltd');
    expect(page2.body.nextCursor).toBeNull();
    const filtered = await request(app.getHttpServer()).get('/admin/leads?websiteStatus=social_only&q=beta').set(AUTH).expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].primaryContact.verification).toBe('valid');

    const detail = await request(app.getHttpServer()).get(`/admin/leads/${a.id}`).set(AUTH).expect(200);
    expect(detail.body.lead.businessName).toBe('Alpha Dental Ltd');
    expect(detail.body.contacts).toHaveLength(1);
    expect(detail.body.events).toEqual([]);
    await request(app.getHttpServer()).get('/admin/leads/nope').set(AUTH).expect(404);

    const patched = await request(app.getHttpServer()).patch(`/admin/leads/${a.id}`).set(AUTH).send({ notes: 'called them', priority: 5 }).expect(200);
    expect(patched.body.priority).toBe(5);

    const act = await request(app.getHttpServer()).post(`/admin/leads/${a.id}/actions/requalify`).set(AUTH).send({}).expect(201);
    expect(act.body.ok).toBe(true);
    expect(await app.get(QueueRegistry).get('qualificationProbe').getJobCounts('waiting', 'delayed').then((c) => (c.waiting ?? 0) + (c.delayed ?? 0))).toBeGreaterThan(0);
    const bulk = await request(app.getHttpServer()).post('/admin/leads/bulk').set(AUTH).send({ ids: [a.id, b.id], action: 'suppress', payload: { reason: 'operator', note: 'test' } }).expect(201);
    expect(bulk.body.enqueued).toBe(2);
    expect((await prisma.lead.findUnique({ where: { id: a.id } }))!.stage).toBe('suppressed');
    const again = await request(app.getHttpServer()).post(`/admin/leads/${a.id}/actions/enrich`).set(AUTH).send({}).expect(201);
    expect(again.body.ok).toBe(false);
    expect(again.body.results[0].error).toMatch(/suppressed/);
    const task = await request(app.getHttpServer()).post(`/admin/leads/${b.id}/tasks`).set(AUTH).send({ title: 'Call back', dueAt: new Date().toISOString() }).expect(201);
    expect((await request(app.getHttpServer()).get('/admin/tasks?open=1').set(AUTH).expect(200)).body).toHaveLength(1);
    await request(app.getHttpServer()).post(`/admin/tasks/${task.body.id}/done`).set(AUTH).expect(201);
    expect((await request(app.getHttpServer()).get('/admin/tasks?open=1').set(AUTH).expect(200)).body).toHaveLength(0);
  });

  it('dashboard aggregates the funnel, sends vs cap, queues, alerts and economics', async () => {
    const res = await request(app.getHttpServer()).get('/admin/dashboard').set(AUTH).expect(200);
    expect(res.body.funnel.find((f: any) => f.stage === 'suppressed').count).toBe(2);
    expect(res.body.sends).toMatchObject({ today: 0 });
    expect(res.body.economics).toHaveProperty('costPerLead');
    expect(typeof res.body.reviewQueue).toBe('number');
  });

  it('quote accept → Stripe checkout; webhook → won, provisioning checklist, subscription with SLA; update requests track the allowance', async () => {
    const lead = await makeLead(prisma, { businessName: 'Gamma Physio Ltd', reviewCount: 70 });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'generated', primaryType: 'physiotherapist', score: 0.8 } });
    const quote = await app.get(QuotingService).createQuote(lead.id);
    expect(quote.tier).toBe('premium');
    expect(quote.currency).toBe('EUR');
    const page = await request(app.getHttpServer()).get(`/q/${quote.slug}`).expect(200);
    expect(page.text).toContain('Gamma Physio Ltd');
    expect(page.text).toContain('Not interested, remove my details');
    expect(page.headers['x-robots-tag']).toContain('noindex');
    const acc = await request(app.getHttpServer()).post(`/q/${quote.slug}/accept`).type('form').send('tier=business').expect(303);
    expect(acc.headers.location).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(gateway.checkouts[0]).toMatchObject({ tier: 'business', currency: 'EUR', buildFee: 1450, monthly: 99 });
    await request(app.getHttpServer()).get(`/q/${quote.slug}/thanks`).expect(200);

    const session = { id: gateway.checkouts[0] && 'cs_test_1', customer: 'cus_1', subscription: 'sub_1', metadata: { quoteId: quote.id, leadId: lead.id, tier: 'business' } };
    await request(app.getHttpServer()).post('/webhooks/stripe').set('stripe-signature', 'bad').send({ type: 'checkout.session.completed', data: session }).expect(404);
    const wh = await request(app.getHttpServer()).post('/webhooks/stripe').set('stripe-signature', 'fake-valid').send({ type: 'checkout.session.completed', data: session }).expect(201);
    expect(wh.body.handled).toBe('accepted');
    const won = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(won!.stage).toBe('won');
    const q2 = await prisma.quote.findUnique({ where: { id: quote.id } });
    expect(q2!.acceptedAt).toBeTruthy();
    expect(q2!.tier).toBe('business');
    const prov = await request(app.getHttpServer()).get(`/admin/conversion/provisioning/${lead.id}`).set(AUTH).expect(200);
    expect(prov.body.checklist).toHaveLength(9);
    expect(prov.body.checklist.find((c: any) => c.key === 'nfc_tags').note).toBe('tags: 1');
    expect(prov.body.cmsKind).toBe('payload');
    expect(prov.body.subscription.tier).toBe('business');
    expect(prov.body.subscription.updatesIncluded).toBe(2);
    expect(prov.body.subscription.sla.hostingMaintenance.uptimeTarget).toBe(0.999);
    await request(app.getHttpServer()).post(`/admin/conversion/provisioning/${lead.id}/items/domain`).set(AUTH).send({ done: true, note: 'transferred' }).expect(201);
    const prov2 = await request(app.getHttpServer()).get(`/admin/conversion/provisioning/${lead.id}`).set(AUTH).expect(200);
    expect(prov2.body.checklist.find((c: any) => c.key === 'domain')).toMatchObject({ done: true, by: 'operator', note: 'transferred' });
    await request(app.getHttpServer()).put(`/admin/conversion/provisioning/${lead.id}/onboarding`).set(AUTH).send({ form: { hours: 'Mon-Fri 9-5' } }).expect(200);
    // duplicate webhook is idempotent
    expect((await request(app.getHttpServer()).post('/webhooks/stripe').set('stripe-signature', 'fake-valid').send({ type: 'checkout.session.completed', data: session }).expect(201)).body.handled).toBe('already accepted');

    const subs = await request(app.getHttpServer()).get('/admin/billing/subscriptions').set(AUTH).expect(200);
    const sub = subs.body.find((s: any) => s.lead.id === lead.id);
    expect(sub.usage).toMatchObject({ used: 0, included: 2, overage: 0 });
    for (let i = 0; i < 3; i++) await request(app.getHttpServer()).post(`/admin/billing/subscriptions/${sub.id}/update-requests`).set(AUTH).send({ description: `change ${i}` }).expect(201);
    const detail = await request(app.getHttpServer()).get(`/admin/billing/subscriptions/${sub.id}`).set(AUTH).expect(200);
    expect(detail.body.usage).toMatchObject({ used: 3, included: 2, overage: 1 });
    expect(detail.body.updateRequests.filter((r: any) => r.billable)).toHaveLength(1);
    await request(app.getHttpServer()).post(`/admin/billing/update-requests/${detail.body.updateRequests[0].id}/complete`).set(AUTH).expect(201);
    await request(app.getHttpServer()).post('/webhooks/stripe').set('stripe-signature', 'fake-valid').send({ type: 'invoice.paid', data: { id: 'in_1', subscription: 'sub_1', amount_paid: 9900, currency: 'eur', period_start: Date.now() / 1000 } }).expect(201);
    const withInvoice = await request(app.getHttpServer()).get(`/admin/billing/subscriptions/${sub.id}`).set(AUTH).expect(200);
    expect(withInvoice.body.invoices[0]).toMatchObject({ amount: 99, currency: 'EUR', status: 'paid' });
    await request(app.getHttpServer()).post('/webhooks/stripe').set('stripe-signature', 'fake-valid').send({ type: 'customer.subscription.deleted', data: { id: 'sub_1' } }).expect(201);
    expect((await prisma.serviceSubscription.findUnique({ where: { id: sub.id } }))!.status).toBe('cancelled');
  });

  it('decline link suppresses and takes down; business days helper skips weekends', async () => {
    const lead = await makeLead(prisma, { businessName: 'Delta Cafe Ltd' });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'generated' } });
    const quote = await app.get(QuotingService).createQuote(lead.id);
    const res = await request(app.getHttpServer()).get(`/q/${quote.slug}/decline`).expect(200);
    expect(res.text).toContain('deleted');
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.stage).toBe('suppressed');
    await request(app.getHttpServer()).get(`/q/${quote.slug}`).expect(404);
    expect(addBusinessDays(new Date('2026-10-09T12:00:00Z'), 2).toISOString().slice(0, 10)).toBe('2026-10-13'); // Fri + 2 business days = Tue
  });
});
