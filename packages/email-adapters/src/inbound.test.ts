import { describe, expect, it } from 'vitest';
import { FakeInboundSource, buildMessageId, extractReplyText, parseRawEmail } from './index';
import type { InboundMessage } from './index';

const RAW = [
  'Return-Path: <owner@bella.example>',
  'Delivered-To: replies@getagency.example',
  'From: "Maria Borg" <owner@bella.example>',
  'To: Jane <replies@getagency.example>, second@getagency.example',
  'Subject: Re: A concept for Bella Pizza',
  'Date: Wed, 01 May 2024 10:15:00 +0200',
  'Message-ID: <CAF123@mail.bella.example>',
  'In-Reply-To: <abc123@getagency.example>',
  'References: <root@getagency.example>',
  '\t<abc123@getagency.example>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset="utf-8"',
  '',
  'Yes, this looks interesting. Can you call me tomorrow?',
  '',
  'Maria',
  '',
  'On Tue, 30 Apr 2024 at 09:00, Jane <jane@getagency.example> wrote:',
  '> Hello Maria,',
  '> We made a mockup.',
  '',
].join('\r\n');

describe('parseRawEmail', () => {
  it('parses headers, threading ids and body', async () => {
    const m = await parseRawEmail(RAW);
    expect(m.from).toBe('owner@bella.example');
    expect(m.to).toEqual(['replies@getagency.example', 'second@getagency.example']);
    expect(m.subject).toBe('Re: A concept for Bella Pizza');
    expect(m.messageId).toBe('<CAF123@mail.bella.example>');
    expect(m.inReplyTo).toBe('<abc123@getagency.example>');
    expect(m.references).toEqual(['<root@getagency.example>', '<abc123@getagency.example>']);
    expect(m.date).toBe('2024-05-01T08:15:00.000Z');
    expect(m.html).toBeNull();
    expect(m.text).toContain('Yes, this looks interesting.');
    expect(m.raw).toBe(RAW);
    expect(extractReplyText(m.text)).toBe('Yes, this looks interesting. Can you call me tomorrow?\n\nMaria');
  });

  it('accepts a Buffer and html-only bodies', async () => {
    const raw = Buffer.from('From: a@x.example\r\nTo: b@y.example\r\nSubject: Hi\r\nContent-Type: text/html\r\n\r\n<p>Hello <b>there</b></p>');
    const m = await parseRawEmail(raw);
    expect(m.html).toContain('<b>there</b>');
    expect(m.text).toBe('Hello there');
    expect(m.inReplyTo).toBeNull();
    expect(m.references).toEqual([]);
    expect(m.messageId).toBeNull();
    expect(Date.parse(m.date)).not.toBeNaN();
  });
});

describe('extractReplyText', () => {
  it('strips quoted lines and everything after "On ... wrote:"', () => {
    expect(extractReplyText('Sure.\n\nOn Mon, Jan 1, 2024 at 9:00 AM Jane <j@x> wrote:\n> hi\n> there')).toBe('Sure.');
  });
  it('handles Gmail-wrapped "wrote:" lines', () => {
    expect(extractReplyText('Sure.\nOn Mon, 1 Jan 2024 at 09:00, Jane Doe <jane@getagency.example>\nwrote:\n\n> hi')).toBe('Sure.');
  });
  it('strips Outlook original-message and From: header blocks', () => {
    expect(extractReplyText('No thanks\n\n-----Original Message-----\nFrom: Jane\nSent: Monday\nTo: me\nSubject: x\n\nbody')).toBe('No thanks');
    expect(extractReplyText('No thanks\n\nFrom: Jane <j@x>\nSent: Monday, 1 January 2024\nTo: me\nSubject: x\n\nbody')).toBe('No thanks');
    expect(extractReplyText('Ok\n________________________________\nFrom: Jane\nSent: x')).toBe('Ok');
  });
  it('strips "Sent from my" and "-- " signatures', () => {
    expect(extractReplyText('Call me\n\nSent from my iPhone')).toBe('Call me');
    expect(extractReplyText('Call me\n-- \nMaria Borg\nOwner')).toBe('Call me');
  });
  it('falls back to unquoted text for bottom-posted replies', () => {
    expect(extractReplyText('On Mon Jane wrote:\n> Are you interested?\nYes, very much.\n')).toBe('Yes, very much.');
  });
  it('returns empty for empty input', () => {
    expect(extractReplyText('')).toBe('');
    expect(extractReplyText('> only quotes\n> here')).toBe('');
  });
});

describe('buildMessageId', () => {
  it('produces <nanoid@domain> with a 21-char url-safe id', () => {
    const id = buildMessageId('getagency.example');
    expect(id).toMatch(/^<[A-Za-z0-9_-]{21}@getagency\.example>$/);
    expect(buildMessageId('getagency.example')).not.toBe(id);
    expect(buildMessageId('@x.example')).toMatch(/^<[A-Za-z0-9_-]{21}@x\.example>$/);
    expect(() => buildMessageId('')).toThrow();
  });
});

describe('FakeInboundSource', () => {
  const msg = (from: string): InboundMessage => ({ from, to: ['a@x'], subject: null, text: 'hi', html: null, messageId: null, inReplyTo: null, references: [], date: new Date().toISOString(), raw: '' });
  it('returns messages after sinceUid and advances lastUid', async () => {
    const s = new FakeInboundSource();
    expect(await s.poll()).toEqual({ messages: [], lastUid: 0 });
    s.push(msg('a@x'));
    s.push(msg('b@x'));
    const first = await s.poll();
    expect(first.messages.map((m) => m.from)).toEqual(['a@x', 'b@x']);
    expect(first.lastUid).toBe(2);
    s.push(msg('c@x'));
    const second = await s.poll(first.lastUid);
    expect(second.messages.map((m) => m.from)).toEqual(['c@x']);
    expect(second.lastUid).toBe(3);
    expect((await s.poll(3)).messages).toEqual([]);
  });
});
