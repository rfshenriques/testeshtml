import type { EmailProvider, OutboundEmail, ProviderEvent, SendResult } from './types';
import { asRecord, asString, parseMaybeJson, splitMessageIds } from './util';

export interface SmartleadProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Default https://server.smartlead.ai/api/v1 */
  baseUrl?: string;
  /**
   * Smartlead email-account id used for sends. Falls back to `email.tags.smartleadAccountId`,
   * then to the from address. Additive to the PACKAGES.md contract.
   */
  emailAccountId?: string | number;
}

/**
 * Smartlead provider — best-effort adapter for the managed cold-email alternative in spec §11.4
 * (DECISION: SES vs Smartlead/Instantly).
 *
 * !! Endpoint details (path, payload field names, webhook event shapes) MUST be verified against
 * Smartlead's current API documentation before production use. Smartlead is campaign-centric;
 * single-message sends via an email account are implemented here as
 * `POST {baseUrl}/email-accounts/{account}/send?api_key=…` with `{ to, subject, body }`.
 */
export class SmartleadProvider implements EmailProvider {
  readonly name = 'smartlead' as const;
  static readonly DEFAULT_BASE_URL = 'https://server.smartlead.ai/api/v1';
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly opts: SmartleadProviderOptions) {
    if (!opts.apiKey) throw new Error('SmartleadProvider: apiKey is required');
    const f = opts.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') throw new Error('SmartleadProvider: no fetch implementation available');
    this.fetchImpl = f;
    this.baseUrl = (opts.baseUrl ?? SmartleadProvider.DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const account = String(this.opts.emailAccountId ?? email.tags?.smartleadAccountId ?? email.from.address);
    const url = `${this.baseUrl}/email-accounts/${encodeURIComponent(account)}/send?api_key=${encodeURIComponent(this.opts.apiKey)}`;
    const payload = {
      to: email.to,
      subject: email.subject,
      body: email.html ?? email.text,
      text: email.text,
      from_name: email.from.name,
      reply_to: email.replyTo,
      message_id: email.messageId,
      headers: email.headers,
    };
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const raw = parseMaybeJson(text);
    if (!res.ok) {
      throw new Error(`Smartlead send failed: HTTP ${res.status} ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`);
    }
    const r = asRecord(raw);
    const providerId = asString(r.message_id) ?? asString(r.id) ?? asString(r.email_id) ?? email.messageId ?? '';
    const accepted = r.ok === true || r.success === true || r.status === 'success' || (!('ok' in r) && !('success' in r));
    return { providerId, accepted, raw };
  }

  /** Maps Smartlead webhook `event_type` EMAIL_BOUNCE / EMAIL_REPLY / EMAIL_SENT. Field names best-effort — verify. */
  parseWebhook(body: unknown, _headers?: Record<string, string>): ProviderEvent[] {
    const b = asRecord(parseMaybeJson(body));
    const eventType = (asString(b.event_type) ?? asString(b.eventType) ?? '').toUpperCase();
    const recipient = asString(b.to_email) ?? asString(b.lead_email) ?? asString(b.email) ?? '';
    const providerId = asString(b.message_id) ?? asString(b.sent_message_id) ?? asString(asRecord(b.sent_message).message_id);
    if (!eventType || !recipient) return [];

    switch (eventType) {
      case 'EMAIL_BOUNCE':
      case 'EMAIL_BOUNCED': {
        const reason = asString(b.bounce_reason) ?? asString(b.reason) ?? 'bounce';
        const soft = /soft|temporar|transient|mailbox full|try again/i.test(reason);
        return [{ type: 'bounce', providerId, recipient, hard: !soft, reason }];
      }
      case 'EMAIL_REPLY':
      case 'EMAIL_REPLIED': {
        const reply = asRecord(b.reply_message);
        const text = asString(reply.text) ?? asString(b.reply_body) ?? asString(reply.html) ?? '';
        return [
          {
            type: 'reply',
            providerId,
            recipient,
            from: asString(b.from_email) ?? asString(reply.from) ?? recipient,
            subject: asString(b.subject) ?? asString(reply.subject),
            text,
            inReplyTo: splitMessageIds(reply.in_reply_to ?? b.in_reply_to)[0] ?? providerId,
            references: splitMessageIds(reply.references ?? b.references),
            receivedAt: toIso(asString(reply.time) ?? asString(b.event_timestamp) ?? asString(b.time)),
          },
        ];
      }
      case 'EMAIL_SENT':
      case 'EMAIL_DELIVERED':
        return [{ type: 'delivered', providerId, recipient }];
      case 'EMAIL_COMPLAINT':
      case 'EMAIL_SPAM':
        return [{ type: 'complaint', providerId, recipient }];
      default:
        return [];
    }
  }
}

function toIso(s: string | null): string {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
