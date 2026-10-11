import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp, makeLead } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PLACES_CLIENT } from '../../src/modules/discovery/places.provider';
import { EMAIL_PROVIDER, INBOUND_SOURCE } from '../../src/modules/outreach/email.types';
import { MailboxService } from '../../src/modules/outreach/mailbox.service';
import { SequenceService } from '../../src/modules/outreach/sequence.service';
import { SendService } from '../../src/modules/outreach/send.service';
import { IngestService } from '../../src/modules/outreach/ingest.service';
import { KillSwitchService } from '../../src/modules/ops/kill-switch.service';
import { SuppressionService } from '../../src/modules/compliance/suppression.service';
import { LlmService, FakeLlmClient } from '../../src/shared/llm/llm.service';
import { QueueRegistry } from '../../src/shared/queues/queue-registry.service';
import { PreviewService } from '../../src/modules/preview/preview.service';
import { hashEmail } from '../../src/modules/compliance/suppression.util';
import { zonedParts } from '../../src/modules/outreach/timing';

const WEEKS = (n: number) => new Date(Date.now() - n * 7 * 86400_000);

describe('Outreach (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: any;
  let inbound: any;
  let mailboxes: MailboxService;
  let sequence: SequenceService;
  let send: SendService;
  let ingest: IngestService;
  let llm: FakeLlmClient;
  let mailboxId: string;

  beforeAll(async () => {
    app = await createTestApp((b) => b.overrideProvider(PLACES_CLIENT).useValue({}));
    prisma = app.get(PrismaService);
    provider = app.get(EMAIL_PROVIDER);
    inbound = app.get(INBOUND_SOURCE);
    mailboxes = app.get(MailboxService);
    sequence = app.get(SequenceService);
    send = app.get(SendService);
    ingest = app.get(IngestService);
    llm = new FakeLlmClient();
    app.get(LlmService).setClient(llm);
    sequence.rand = () => 0.5;
    await mailboxes.addDomain('getteststudio.com', 'test');
    const mb = await mailboxes.addMailbox('anna@getteststudio.com', 'getteststudio.com', 'test');
    await prisma.mailbox.update({ where: { id: mb.id }, data: { warmupStartedAt: WEEKS(8), dailyCap: 50, status: 'active' } });
    mailboxId = mb.id;
  });
  afterAll(() => closeTestApp(app));

  /** A quoted lead with a live preview, a valid primary contact and a quote. */
  async function readyLead(name = 'Valletta Dental Clinic Ltd') {
    const lead = await makeLead(prisma, { businessName: name, reviewCount: 80 });
    const slug = `slug${lead.id.slice(-18)}`;
    await prisma.generatedSite.create({ data: { leadId: lead.id, templateId: 'appointment', contentBrief: {}, copy: {}, buildHash: 'h', previewSlug: slug, previewUrl: `http://localhost:3000/p/${slug}`, objectPrefix: `previews/${slug}/`, publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400_000) } });
    await prisma.quote.create({ data: { leadId: lead.id, slug: `q${lead.id.slice(-10)}`, currency: 'EUR', buildFee: 1450, monthlyFee: 99, tier: 'business', lineItems: [], allTiers: {}, validUntil: new Date(Date.now() + 14 * 86400_000) } });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'quoted', scoreBreakdown: { inputs: { competitivePressureShare: 0.7, sameTypeInTile: 9 } }, score: 0.8, city: 'Valletta', vertical: 'dental' } });
    return prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { contacts: true } });
  }

  async function approveAll() {
    await prisma.setting.upsert({ where: { key: 'outreach.approvedSends' }, create: { key: 'outreach.approvedSends', value: 20 }, update: { value: 20 } });
  }

  it('starts a sequence: step 1 is queued for hand approval, in a Tue–Thu window, with a compliant preview; approve → dispatch → sent with headers; step 2 scheduled +4 days', async () => {
    const lead = await readyLead();
    const msg = await sequence.start(lead.id, 'operator');
    expect(msg.requiresApproval).toBe(true);
    expect(msg.sequenceStep).toBe(1);
    const p = zonedParts(msg.scheduledFor!, 'Europe/Malta');
    expect([2, 3, 4]).toContain(p.weekday);
    expect(msg.subject).toBe('dental in valletta without a website');
    expect(msg.bodyText).toContain('around 70% of the dentals nearby');
    const q = await request(app.getHttpServer()).get('/admin/outreach/approval-queue').set(AUTH).expect(200);
    expect(q.body.find((m: any) => m.id === msg.id).lead.businessName).toBe(lead.businessName);
    const prev = await request(app.getHttpServer()).get(`/admin/outreach/messages/${msg.id}/preview`).set(AUTH).expect(200);
    expect(prev.body.bodyText).toContain('Test Studio Ltd');
    expect(prev.body.bodyText).toContain('/u/');
    expect(prev.body.bodyText).toContain('http://localhost:3000/t/');
    expect(prev.body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    expect(await send.dispatch(msg.id)).toEqual({ sent: false, reason: 'awaiting hand approval', terminal: false });
    await request(app.getHttpServer()).post(`/admin/outreach/messages/${msg.id}/approve`).set(AUTH).expect(201);
    const job = await app.get(QueueRegistry).get('outreachSend').getJob(`send-${msg.id}`);
    expect(job).toBeTruthy();
    const out = await send.dispatch(msg.id);
    expect(out.sent).toBe(true);
    const email = provider.sent.at(-1);
    expect(email.to).toBe(lead.contacts[0].email);
    expect(email.headers['List-Unsubscribe']).toContain('/u/');
    expect(email.headers['Message-ID']).toMatch(/@getteststudio\.com>$/);
    expect(email.text).toContain('identified your business on Google Maps');
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after!.stage).toBe('contacted');
    expect(await prisma.auditLog.count({ where: { leadId: lead.id, action: 'email.sent' } })).toBe(1);
    const step2 = await prisma.outreachMessage.findFirst({ where: { leadId: lead.id, sequenceStep: 2 } });
    expect(step2).toBeTruthy();
    expect(step2!.scheduledFor!.getTime()).toBeGreaterThan(Date.now() + 3.9 * 86400_000);
    expect(await sequence.approvedSends()).toBe(1);
    // click tracking
    const link = email.text.match(/http:\/\/localhost:3000\/t\/[^\s]+/)![0];
    const r = await request(app.getHttpServer()).get(link.replace('http://localhost:3000', '')).expect(302);
    expect(r.headers.location).toContain('/p/');
    expect((await prisma.outreachMessage.findUnique({ where: { id: msg.id } }))!.clicks).toBe(1);
  });

  it('dispatch-time checks: suppression, legal gate, kill switch, cap and max-4-touches all block sends', async () => {
    await approveAll();
    const suppressed = await readyLead('Suppressed Ltd');
    const m1 = await sequence.start(suppressed.id);
    await app.get(SuppressionService).add({ email: suppressed.contacts[0].email, reason: 'operator', actor: 'test', cascade: false });
    const o1 = await send.dispatch(m1.id);
    expect(o1).toMatchObject({ sent: false, terminal: true });
    expect((o1 as any).reason).toMatch(/suppressed/);
    expect((await prisma.outreachMessage.findUnique({ where: { id: m1.id } }))!.status).toBe('cancelled');

    const gated = await readyLead('Gated Ltd');
    const m2 = await sequence.start(gated.id);
    await prisma.contact.updateMany({ where: { leadId: gated.id }, data: { verification: 'risky' } });
    expect((await send.dispatch(m2.id) as any).reason).toMatch(/legal gate: unverified/);

    const ks = app.get(KillSwitchService);
    const fine = await readyLead('Fine Ltd');
    const m3 = await sequence.start(fine.id);
    await ks.engage('test');
    await expect(send.dispatch(m3.id)).rejects.toThrow(/Kill switch/);
    await ks.release();
    expect((await prisma.outreachMessage.findUnique({ where: { id: m3.id } }))!.status).toBe('queued');

    // max 4 touches ever (per place, across campaigns)
    const touched = await readyLead('Touched Ltd');
    for (let i = 1; i <= 4; i++) await prisma.outreachMessage.create({ data: { leadId: touched.id, contactId: touched.contacts[0].id, sequenceStep: i, mailboxId, subject: 's', bodyText: 'b', bodyHtml: '', status: 'sent', sentAt: new Date() } });
    await expect(sequence.start(touched.id)).rejects.toThrow(/max 4 touches/);
    await request(app.getHttpServer()).put(`/admin/outreach/sequence`).set(AUTH).send({ steps: [1, 2, 3, 4, 5].map((s) => ({ step: s, delayDays: s, kind: 'nudge' })) }).expect(500);
  });

  it('daily caps are atomic: 60 concurrent reservations on a 50/day mailbox yield exactly 50; warmup week 1 allows 0 real sends', async () => {
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    const used = await mailboxes.usedToday(mb);
    const results = await Promise.allSettled(Array.from({ length: 60 }, () => mailboxes.reserveSend(mb)));
    const ok = results.filter((r) => r.status === 'fulfilled');
    for (const r of ok) await (r as PromiseFulfilledResult<() => Promise<void>>).value();
    expect(ok).toHaveLength(50 - used);
    expect(await mailboxes.usedToday(mb)).toBe(used);
    const warming = await mailboxes.addMailbox('ben@getteststudio.com', 'getteststudio.com', 'test');
    await expect(mailboxes.reserveSend(warming)).rejects.toThrow(/daily cap reached \(0 real sends; warmup cap 5\)/);
    await prisma.mailbox.update({ where: { id: warming.id }, data: { warmupStartedAt: WEEKS(1) } });
    const w2 = await prisma.mailbox.findUniqueOrThrow({ where: { id: warming.id } });
    expect(MailboxService.warmupCap(w2.warmupStartedAt)).toEqual({ week: 2, cap: 10, realShare: 0.2 });
    const cap = await request(app.getHttpServer()).patch(`/admin/outreach/mailboxes/${warming.id}`).set(AUTH).send({ dailyCap: 500 }).expect(200);
    expect(cap.body.dailyCap).toBe(50);
    await expect(mailboxes.addMailbox('c@getteststudio.com', 'getteststudio.com', 'test')).resolves.toBeTruthy();
    await expect(mailboxes.addMailbox('d@getteststudio.com', 'getteststudio.com', 'test')).rejects.toThrow(/at most 3/);
  });

  it('replies: interested → sequence stops, draft for a human, never auto-sent; unsubscribe → suppression + takedown + one confirmation; hostile → suppression, takedown, alert, no email; OOO → postponed', async () => {
    await approveAll();
    const lead = await readyLead('Replying Ltd');
    const m = await sequence.start(lead.id);
    await send.dispatch(m.id);
    const sent = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: m.id } });
    const step2 = await prisma.outreachMessage.findFirst({ where: { leadId: lead.id, sequenceStep: 2 } });
    llm.respond = (req) => (req.purpose === 'reply_intent' ? JSON.stringify({ intent: 'interested', confidence: 0.9, summary: 'wants a call' }) : 'Thanks for getting back to me. Happy to walk you through it on a short call this week.');
    const before = provider.sent.length;
    inbound.push({ from: lead.contacts[0].email, to: ['anna@getteststudio.com'], subject: 'Re: dental in valletta without a website', text: 'Sounds interesting, can we talk on Thursday?', html: null, messageId: '<abc@theirs>', inReplyTo: sent.messageIdHeader, references: [sent.messageIdHeader!], date: new Date().toISOString(), raw: 'raw' });
    await request(app.getHttpServer()).post('/admin/outreach/ingest/poll').set(AUTH).expect(201);
    const reply = await prisma.reply.findFirst({ where: { leadId: lead.id } });
    expect(reply!.intent).toBe('interested');
    expect(reply!.suggestedDraft).toContain('short call');
    expect(provider.sent.length).toBe(before); // nothing auto-sent
    expect((await prisma.outreachMessage.findUnique({ where: { id: step2!.id } }))!.status).toBe('cancelled');
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.stage).toBe('replied');
    expect(await prisma.reviewItem.count({ where: { leadId: lead.id, type: 'reply_draft' } })).toBe(1);
    const inboxRes = await request(app.getHttpServer()).get('/admin/inbox?handled=false').set(AUTH).expect(200);
    expect(inboxRes.body.find((r: any) => r.id === reply!.id).lead.businessName).toBe('Replying Ltd');
    // human-confirmed reply
    await request(app.getHttpServer()).post(`/admin/inbox/${reply!.id}/reply`).set(AUTH).send({ body: 'Thursday 10:00 works. I will call you.' }).expect(201);
    expect(provider.sent.at(-1).headers['In-Reply-To']).toBe(sent.messageIdHeader);
    expect(provider.sent.at(-1).subject).toMatch(/^Re:/);
    expect((await prisma.reply.findUnique({ where: { id: reply!.id } }))!.handled).toBe(true);

    // unsubscribe by rules (no LLM)
    const u = await readyLead('Unsub Ltd');
    const um = await sequence.start(u.id);
    await send.dispatch(um.id);
    const usent = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: um.id } });
    llm.respond = () => { throw new Error('LLM must not be called for rule matches'); };
    inbound.push({ from: u.contacts[0].email, to: [], subject: 'Re: x', text: 'Please unsubscribe me from this list.', html: null, messageId: '<u1@theirs>', inReplyTo: usent.messageIdHeader, references: [], date: new Date().toISOString(), raw: 'raw' });
    await ingest.poll();
    expect(await prisma.suppression.findUnique({ where: { emailHash: hashEmail(u.contacts[0].email) } })).toBeTruthy();
    expect((await prisma.generatedSite.findUnique({ where: { leadId: u.id } }))!.takenDownAt).toBeTruthy();
    expect(provider.sent.at(-1).subject).toBe('confirmed: you are unsubscribed');
    expect((await prisma.reply.findFirst({ where: { leadId: u.id } }))!.classifiedBy).toBe('rules');

    // hostile
    const h = await readyLead('Hostile Ltd');
    const hm = await sequence.start(h.id);
    await send.dispatch(hm.id);
    const hsent = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: hm.id } });
    const sentBefore = provider.sent.length;
    inbound.push({ from: h.contacts[0].email, to: [], subject: 'Re: x', text: 'Stop. My solicitor will be in touch regarding GDPR.', html: null, messageId: '<h1@theirs>', inReplyTo: hsent.messageIdHeader, references: [], date: new Date().toISOString(), raw: 'raw' });
    await ingest.poll();
    expect(provider.sent.length).toBe(sentBefore);
    expect((await prisma.lead.findUnique({ where: { id: h.id } }))!.stage).toBe('suppressed');
    expect(await prisma.alert.count({ where: { kind: 'hostile_reply' } })).toBe(1);

    // out of office
    const o = await readyLead('OOO Ltd');
    const om = await sequence.start(o.id);
    await send.dispatch(om.id);
    const osent = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: om.id } });
    const ostep2 = (await prisma.outreachMessage.findFirst({ where: { leadId: o.id, sequenceStep: 2 } }))!;
    inbound.push({ from: o.contacts[0].email, to: [], subject: 'Automatic reply: out of office', text: 'I am out of the office until next week.', html: null, messageId: '<o1@theirs>', inReplyTo: osent.messageIdHeader, references: [], date: new Date().toISOString(), raw: 'raw' });
    await ingest.poll();
    const moved = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: ostep2.id } });
    expect(moved.status).toBe('queued');
    expect(moved.scheduledFor!.getTime()).toBeGreaterThan(ostep2.scheduledFor!.getTime() + 6 * 86400_000);
    expect((await prisma.lead.findUnique({ where: { id: o.id } }))!.sequenceStoppedAt).toBeNull();
  });

  it('provider events: hard bounce → suppression + contact invalid; complaint → suppression + takedown + alert', async () => {
    await approveAll();
    const b = await readyLead('Bouncy Ltd');
    const bm = await sequence.start(b.id);
    await send.dispatch(bm.id);
    for (const e of provider.simulateBounce(b.contacts[0].email, true)) await ingest.handleEvent(e);
    expect((await prisma.outreachMessage.findUnique({ where: { id: bm.id } }))!.status).toBe('bounced');
    expect((await prisma.contact.findFirst({ where: { leadId: b.id } }))!.verification).toBe('invalid');
    expect(await prisma.suppression.findUnique({ where: { emailHash: hashEmail(b.contacts[0].email) } })).toMatchObject({ reason: 'hard_bounce' });
    const c = await readyLead('Complainer Ltd');
    const cm = await sequence.start(c.id);
    await send.dispatch(cm.id);
    await request(app.getHttpServer()).post('/webhooks/email').send(provider.simulateComplaint(c.contacts[0].email)).expect(200);
    expect((await prisma.generatedSite.findUnique({ where: { leadId: c.id } }))!.takenDownAt).toBeTruthy();
    expect(await prisma.alert.count({ where: { kind: 'spam_complaint' } })).toBe(1);
  });

  it('reputation guardrails pause a mailbox above 3% bounces and burn a domain above 0.3% complaints', async () => {
    await mailboxes.addDomain('teststudio-mail.com', 'test');
    const mb = await mailboxes.addMailbox('x@teststudio-mail.com', 'teststudio-mail.com', 'test');
    await prisma.mailbox.update({ where: { id: mb.id }, data: { warmupStartedAt: WEEKS(8), status: 'active' } });
    const lead = await readyLead('Stats Ltd');
    for (let i = 0; i < 30; i++) await prisma.outreachMessage.create({ data: { leadId: lead.id, contactId: lead.contacts[0].id, sequenceStep: 1, mailboxId: mb.id, subject: 's', bodyText: 'b', bodyHtml: '', status: i < 2 ? 'bounced' : 'sent', sentAt: new Date() } });
    const actions = await mailboxes.enforceGuardrails(mb.id);
    expect(actions).toContain('paused:bounce');
    expect((await prisma.mailbox.findUnique({ where: { id: mb.id } }))!.status).toBe('paused');
    await prisma.outreachMessage.updateMany({ where: { mailboxId: mb.id, status: 'bounced' }, data: { status: 'complained' } });
    const actions2 = await mailboxes.enforceGuardrails(mb.id);
    expect(actions2).toContain('domain:burned');
    expect((await prisma.sendingDomain.findUnique({ where: { domain: 'teststudio-mail.com' } }))!.status).toBe('burned');
    await expect(mailboxes.resume(mb.id)).rejects.toThrow(/burned/);
    const list = await request(app.getHttpServer()).get('/admin/outreach/mailboxes').set(AUTH).expect(200);
    expect(list.body.find((m: any) => m.id === mb.id).reputation.bounceRate7d).toBe(0);
    const capRes = await request(app.getHttpServer()).get('/admin/outreach/capacity').set(AUTH).expect(200);
    expect(capRes.body.ceilingPerMailbox).toBe(50);
  });

  it('a first preview view during a running sequence schedules a bridge message within the touch budget', async () => {
    await approveAll();
    const lead = await readyLead('Viewer Ltd');
    const m = await sequence.start(lead.id);
    await send.dispatch(m.id);
    const site = await prisma.generatedSite.findUniqueOrThrow({ where: { leadId: lead.id } });
    await app.get(PreviewService).trackView(site.id, lead.id, { ip: '198.51.100.1', ua: 'phone' });
    const bridge = await prisma.outreachMessage.findFirst({ where: { leadId: lead.id, kind: 'bridge' } });
    expect(bridge).toBeTruthy();
    expect(bridge!.subject).toBe('saw you opened the mockup');
    expect(bridge!.bodyText).toContain('I saw the mockup');
    const touches = await sequence.touches(lead.id);
    expect(touches).toBeLessThanOrEqual(4);
    const sched = await request(app.getHttpServer()).get('/admin/outreach/schedule?days=30').set(AUTH).expect(200);
    expect(sched.body.length).toBeGreaterThan(0);
  });
});
