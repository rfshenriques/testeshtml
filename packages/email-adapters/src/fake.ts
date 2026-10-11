import type { EmailProvider, OutboundEmail, ProviderEvent, SendResult } from './types';

/** In-memory provider for tests and dry runs. */
export class FakeProvider implements EmailProvider {
  readonly name = 'fake' as const;
  sent: OutboundEmail[] = [];
  results: SendResult[] = [];
  /** When set, the next send() throws this error (once). */
  failNext?: Error;
  private counter = 0;

  constructor() {}

  async send(email: OutboundEmail): Promise<SendResult> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = undefined;
      throw err;
    }
    this.counter += 1;
    const result: SendResult = { providerId: `fake-${this.counter}`, accepted: true };
    this.sent.push(email);
    this.results.push(result);
    return result;
  }

  /** Accepts an already-normalised ProviderEvent or an array of them (JSON string allowed). */
  parseWebhook(body: unknown, _headers?: Record<string, string>): ProviderEvent[] {
    let parsed: unknown = body;
    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch {
        return [];
      }
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((e): e is ProviderEvent => Boolean(e) && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string');
  }

  private lastSentTo(recipient: string): { email: OutboundEmail; result: SendResult } | null {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i].to.toLowerCase() === recipient.toLowerCase()) return { email: this.sent[i], result: this.results[i] };
    }
    return null;
  }

  simulateBounce(recipient: string, hard = true): ProviderEvent[] {
    const last = this.lastSentTo(recipient);
    return [
      {
        type: 'bounce',
        providerId: last?.result.providerId ?? null,
        recipient,
        hard,
        reason: hard ? 'Permanent/General: simulated hard bounce' : 'Transient/General: simulated soft bounce',
      },
    ];
  }

  simulateComplaint(recipient: string): ProviderEvent[] {
    const last = this.lastSentTo(recipient);
    return [{ type: 'complaint', providerId: last?.result.providerId ?? null, recipient }];
  }

  simulateDelivery(recipient: string): ProviderEvent[] {
    const last = this.lastSentTo(recipient);
    return [{ type: 'delivered', providerId: last?.result.providerId ?? null, recipient }];
  }

  simulateReply(recipient: string, text: string, inReplyTo?: string | null): ProviderEvent[] {
    const last = this.lastSentTo(recipient);
    const threadId = inReplyTo ?? last?.email.messageId ?? null;
    return [
      {
        type: 'reply',
        providerId: last?.result.providerId ?? null,
        recipient,
        from: recipient,
        subject: last ? `Re: ${last.email.subject}` : null,
        text,
        inReplyTo: threadId,
        references: threadId ? [threadId] : [],
        receivedAt: new Date().toISOString(),
      },
    ];
  }
}
