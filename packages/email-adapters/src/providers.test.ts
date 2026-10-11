import { describe, expect, it, vi } from 'vitest';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { FakeProvider, SesProvider, SmartleadProvider } from './index';
import type { OutboundEmail } from './index';

const email = (over: Partial<OutboundEmail> = {}): OutboundEmail => ({
  from: { address: 'jane@getagency.example', name: 'Jane at Agency' },
  to: 'owner@bella.example',
  subject: 'A concept for Bella Pizza',
  text: 'Hello,\n\nWe made a mockup.\n',
  html: '<p>Hello</p>',
  headers: { 'List-Unsubscribe': '<https://x.example/u/abc>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  replyTo: 'replies@getagency.example',
  messageId: '<abc123@getagency.example>',
  tags: { campaign: 'c1' },
  ...over,
});

describe('FakeProvider', () => {
  it('records sends with incrementing ids and supports failNext', async () => {
    const p = new FakeProvider();
    const r1 = await p.send(email());
    const r2 = await p.send(email({ to: 'other@x.example' }));
    expect(r1).toEqual({ providerId: 'fake-1', accepted: true });
    expect(r2.providerId).toBe('fake-2');
    expect(p.sent).toHaveLength(2);
    p.failNext = new Error('boom');
    await expect(p.send(email())).rejects.toThrow('boom');
    expect(p.failNext).toBeUndefined();
    expect((await p.send(email())).providerId).toBe('fake-3');
  });

  it('simulates bounce / complaint / reply linked to the last send', async () => {
    const p = new FakeProvider();
    await p.send(email());
    expect(p.simulateBounce('owner@bella.example')).toEqual([
      { type: 'bounce', providerId: 'fake-1', recipient: 'owner@bella.example', hard: true, reason: expect.stringMatching(/Permanent/) },
    ]);
    expect(p.simulateBounce('owner@bella.example', false)[0]).toMatchObject({ hard: false });
    expect(p.simulateBounce('nobody@x.example')[0]).toMatchObject({ providerId: null });
    expect(p.simulateComplaint('owner@bella.example')).toEqual([{ type: 'complaint', providerId: 'fake-1', recipient: 'owner@bella.example' }]);
    const [reply] = p.simulateReply('owner@bella.example', 'Sounds good');
    expect(reply).toMatchObject({
      type: 'reply', providerId: 'fake-1', recipient: 'owner@bella.example', from: 'owner@bella.example',
      subject: 'Re: A concept for Bella Pizza', text: 'Sounds good', inReplyTo: '<abc123@getagency.example>', references: ['<abc123@getagency.example>'],
    });
    expect(reply.type === 'reply' && Date.parse(reply.receivedAt)).not.toBeNaN();
    expect(p.simulateReply('owner@bella.example', 'x', '<other@y>')[0]).toMatchObject({ inReplyTo: '<other@y>' });
    expect(p.parseWebhook(JSON.stringify(reply))).toEqual([reply]);
    expect(p.parseWebhook('garbage')).toEqual([]);
  });
});

describe('SesProvider.send', () => {
  it('builds a SendEmailCommand with Simple content and custom headers', async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: 'ses-msg-1' });
    const p = new SesProvider({ region: 'eu-west-1', configurationSet: 'outreach', client: { send } });
    const r = await p.send(email());
    expect(r).toMatchObject({ providerId: 'ses-msg-1', accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(SendEmailCommand);
    const input = cmd.input;
    expect(input.FromEmailAddress).toBe('"Jane at Agency" <jane@getagency.example>');
    expect(input.Destination).toEqual({ ToAddresses: ['owner@bella.example'] });
    expect(input.ReplyToAddresses).toEqual(['replies@getagency.example']);
    expect(input.ConfigurationSetName).toBe('outreach');
    expect(input.EmailTags).toEqual([{ Name: 'campaign', Value: 'c1' }]);
    expect(input.Content.Simple.Subject).toEqual({ Data: 'A concept for Bella Pizza', Charset: 'UTF-8' });
    expect(input.Content.Simple.Body.Text.Data).toBe('Hello,\n\nWe made a mockup.\n');
    expect(input.Content.Simple.Body.Html.Data).toBe('<p>Hello</p>');
    expect(input.Content.Simple.Headers).toEqual([
      { Name: 'List-Unsubscribe', Value: '<https://x.example/u/abc>' },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
      { Name: 'Message-ID', Value: '<abc123@getagency.example>' },
    ]);
  });

  it('omits optional parts when absent and reports not accepted without a MessageId', async () => {
    const send = vi.fn().mockResolvedValue({});
    const p = new SesProvider({ region: 'eu-west-1', client: { send } });
    const r = await p.send(email({ html: undefined, replyTo: undefined, tags: undefined, messageId: undefined, headers: {}, from: { address: 'a@b.example' } }));
    expect(r.accepted).toBe(false);
    const input = send.mock.calls[0][0].input;
    expect(input.FromEmailAddress).toBe('a@b.example');
    expect(input.Content.Simple.Headers).toBeUndefined();
    expect(input.Content.Simple.Body.Html).toBeUndefined();
    expect(input.ReplyToAddresses).toBeUndefined();
    expect(input.ConfigurationSetName).toBeUndefined();
  });
});

describe('SesProvider.parseWebhook', () => {
  const p = new SesProvider({ region: 'eu-west-1', client: { send: vi.fn() } });
  const sns = (message: unknown) => ({ Type: 'Notification', MessageId: 'sns-1', TopicArn: 'arn', Message: JSON.stringify(message), Timestamp: '2024-01-01T00:00:00Z' });

  it('maps a permanent bounce to a hard bounce', () => {
    const events = p.parseWebhook(JSON.stringify(sns({
      notificationType: 'Bounce',
      bounce: { bounceType: 'Permanent', bounceSubType: 'General', bouncedRecipients: [{ emailAddress: 'owner@bella.example', diagnosticCode: 'smtp; 550 5.1.1 user unknown' }] },
      mail: { messageId: 'ses-msg-1' },
    })));
    expect(events).toEqual([{ type: 'bounce', providerId: 'ses-msg-1', recipient: 'owner@bella.example', hard: true, reason: 'Permanent/General: smtp; 550 5.1.1 user unknown' }]);
  });

  it('maps a transient bounce to a soft bounce', () => {
    const events = p.parseWebhook(sns({
      notificationType: 'Bounce',
      bounce: { bounceType: 'Transient', bounceSubType: 'MailboxFull', bouncedRecipients: [{ emailAddress: 'a@x.example' }, { emailAddress: 'b@x.example' }] },
      mail: { messageId: 'ses-msg-2' },
    }));
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'bounce', providerId: 'ses-msg-2', recipient: 'a@x.example', hard: false, reason: 'Transient/MailboxFull' });
  });

  it('maps complaints and deliveries, including eventType (event publishing) payloads', () => {
    expect(p.parseWebhook(sns({ notificationType: 'Complaint', complaint: { complainedRecipients: [{ emailAddress: 'c@x.example' }] }, mail: { messageId: 'm3' } })))
      .toEqual([{ type: 'complaint', providerId: 'm3', recipient: 'c@x.example' }]);
    expect(p.parseWebhook(sns({ eventType: 'Delivery', delivery: { recipients: ['d@x.example'] }, mail: { messageId: 'm4' } })))
      .toEqual([{ type: 'delivered', providerId: 'm4', recipient: 'd@x.example' }]);
    // Message object already unwrapped
    expect(p.parseWebhook({ notificationType: 'Delivery', delivery: { recipients: ['e@x.example'] }, mail: {} }))
      .toEqual([{ type: 'delivered', providerId: null, recipient: 'e@x.example' }]);
  });

  it('ignores SubscriptionConfirmation and unknown payloads', () => {
    expect(p.parseWebhook({ Type: 'SubscriptionConfirmation', SubscribeURL: 'https://sns.example/confirm', Token: 't' })).toEqual([]);
    expect(p.parseWebhook(sns({ eventType: 'Open', mail: { messageId: 'm' } }))).toEqual([]);
    expect(p.parseWebhook('not json')).toEqual([]);
    expect(p.parseWebhook(null)).toEqual([]);
  });
});

describe('SmartleadProvider', () => {
  it('posts to the email-account send endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, message_id: 'sl-1' }), { status: 200 }));
    const p = new SmartleadProvider({ apiKey: 'sk', fetch, emailAccountId: 42 });
    const r = await p.send(email());
    expect(r).toMatchObject({ providerId: 'sl-1', accepted: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://server.smartlead.ai/api/v1/email-accounts/42/send?api_key=sk');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: 'owner@bella.example', subject: 'A concept for Bella Pizza', body: '<p>Hello</p>' });
    expect(body.headers['List-Unsubscribe']).toBe('<https://x.example/u/abc>');
  });

  it('throws on HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    const p = new SmartleadProvider({ apiKey: 'sk', fetch });
    await expect(p.send(email())).rejects.toThrow(/401/);
  });

  it('parses webhook event types', () => {
    const p = new SmartleadProvider({ apiKey: 'sk', fetch: vi.fn() });
    expect(p.parseWebhook({ event_type: 'EMAIL_BOUNCE', to_email: 'o@x.example', message_id: 'm1', bounce_reason: '550 user unknown' }))
      .toEqual([{ type: 'bounce', providerId: 'm1', recipient: 'o@x.example', hard: true, reason: '550 user unknown' }]);
    expect(p.parseWebhook({ event_type: 'EMAIL_SENT', to_email: 'o@x.example', message_id: 'm1' }))
      .toEqual([{ type: 'delivered', providerId: 'm1', recipient: 'o@x.example' }]);
    const [reply] = p.parseWebhook({
      event_type: 'EMAIL_REPLY', to_email: 'o@x.example', from_email: 'o@x.example', subject: 'Re: hi', message_id: 'm1',
      event_timestamp: '2024-05-01T10:00:00Z', reply_message: { text: 'yes please', in_reply_to: '<m1@agency>', references: '<m0@agency> <m1@agency>' },
    });
    expect(reply).toEqual({
      type: 'reply', providerId: 'm1', recipient: 'o@x.example', from: 'o@x.example', subject: 'Re: hi', text: 'yes please',
      inReplyTo: '<m1@agency>', references: ['<m0@agency>', '<m1@agency>'], receivedAt: '2024-05-01T10:00:00.000Z',
    });
    expect(p.parseWebhook({ event_type: 'EMAIL_OPEN', to_email: 'o@x.example' })).toEqual([]);
    expect(p.parseWebhook({})).toEqual([]);
  });
});
