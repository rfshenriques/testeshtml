import { simpleParser } from 'mailparser';
import type { AddressObject, ParsedMail } from 'mailparser';
import type { InboundMessage, InboundSource } from './types';
import { splitMessageIds } from './util';

function addressList(v: AddressObject | AddressObject[] | undefined): string[] {
  if (!v) return [];
  const objs = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const o of objs) {
    for (const a of o.value ?? []) {
      if (a.address) out.push(a.address.toLowerCase());
      for (const g of a.group ?? []) if (g.address) out.push(g.address.toLowerCase());
    }
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function parsedMailToInbound(parsed: ParsedMail, raw: string): InboundMessage {
  const html = typeof parsed.html === 'string' && parsed.html.length > 0 ? parsed.html : null;
  const text = parsed.text && parsed.text.trim().length > 0 ? parsed.text : html ? htmlToText(html) : '';
  return {
    from: addressList(parsed.from)[0] ?? '',
    to: addressList(parsed.to),
    subject: parsed.subject && parsed.subject.length > 0 ? parsed.subject : null,
    text,
    html,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ? (splitMessageIds(parsed.inReplyTo)[0] ?? parsed.inReplyTo) : null,
    references: splitMessageIds(parsed.references),
    date: (parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : new Date()).toISOString(),
    raw,
  };
}

/** Parse an RFC 822 message with mailparser. */
export async function parseRawEmail(raw: string | Buffer): Promise<InboundMessage> {
  const parsed = await simpleParser(raw);
  return parsedMailToInbound(parsed, Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
}

/** In-memory inbound source for tests. Each pushed message gets the next UID. */
export class FakeInboundSource implements InboundSource {
  readonly name = 'fake';
  queue: InboundMessage[] = [];
  private readonly uids = new Map<InboundMessage, number>();
  private nextUid = 1;

  push(m: InboundMessage): void {
    this.queue.push(m);
    this.uids.set(m, this.nextUid++);
  }

  async poll(sinceUid = 0): Promise<{ messages: InboundMessage[]; lastUid: number }> {
    const messages = this.queue.filter((m) => (this.uids.get(m) ?? 0) > sinceUid);
    const lastUid = messages.reduce((max, m) => Math.max(max, this.uids.get(m) ?? 0), sinceUid);
    return { messages, lastUid };
  }
}
