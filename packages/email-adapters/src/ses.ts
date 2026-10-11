import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { SendEmailCommandInput, SendEmailCommandOutput } from '@aws-sdk/client-sesv2';
import type { EmailProvider, OutboundEmail, ProviderEvent, SendResult } from './types';
import { asRecord, asString, formatAddress, parseMaybeJson } from './util';

export interface SesProviderOptions {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** SES configuration set (event publishing to SNS → parseWebhook). */
  configurationSet?: string;
  /** Injected client for tests: anything with `send(command) => Promise<SendEmailCommandOutput>`. */
  client?: unknown;
}

interface SesLikeClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

/**
 * Amazon SES v2 provider (spec §11.4 recommendation for v1). Uses Simple content with custom
 * `Headers` (List-Unsubscribe, List-Unsubscribe-Post, …). SES assigns its own Message-ID; when
 * `email.messageId` is set it is passed as a `Message-ID` header so In-Reply-To matching (spec §11.7)
 * works — verify against current SES behaviour that the header is honoured for your identity.
 */
export class SesProvider implements EmailProvider {
  readonly name = 'ses' as const;
  private readonly client: SesLikeClient;
  private readonly configurationSet?: string;

  constructor(opts: SesProviderOptions) {
    this.configurationSet = opts.configurationSet;
    if (opts.client) {
      this.client = opts.client as SesLikeClient;
    } else {
      this.client = new SESv2Client({
        region: opts.region,
        ...(opts.accessKeyId && opts.secretAccessKey
          ? { credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } }
          : {}),
      });
    }
  }

  buildCommandInput(email: OutboundEmail): SendEmailCommandInput {
    const headers: { Name: string; Value: string }[] = Object.entries(email.headers ?? {})
      .filter(([k, v]) => k && typeof v === 'string')
      .map(([Name, Value]) => ({ Name, Value }));
    if (email.messageId && !headers.some((h) => h.Name.toLowerCase() === 'message-id')) {
      headers.push({ Name: 'Message-ID', Value: email.messageId });
    }
    const tags = Object.entries(email.tags ?? {}).map(([Name, Value]) => ({ Name, Value }));
    return {
      FromEmailAddress: formatAddress(email.from),
      Destination: { ToAddresses: [email.to] },
      ...(email.replyTo ? { ReplyToAddresses: [email.replyTo] } : {}),
      ...(this.configurationSet ? { ConfigurationSetName: this.configurationSet } : {}),
      ...(tags.length ? { EmailTags: tags } : {}),
      Content: {
        Simple: {
          Subject: { Data: email.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: email.text, Charset: 'UTF-8' },
            ...(email.html ? { Html: { Data: email.html, Charset: 'UTF-8' } } : {}),
          },
          ...(headers.length ? { Headers: headers } : {}),
        },
      },
    };
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const out = await this.client.send(new SendEmailCommand(this.buildCommandInput(email)));
    return { providerId: out.MessageId ?? '', accepted: Boolean(out.MessageId), raw: out };
  }

  /**
   * Parses an SNS envelope (Type Notification / SubscriptionConfirmation) carrying an SES
   * notification (`notificationType`) or event-publishing record (`eventType`).
   * SubscriptionConfirmation is ignored (confirm it out-of-band) and yields [].
   */
  parseWebhook(body: unknown, _headers?: Record<string, string>): ProviderEvent[] {
    const envelope = asRecord(parseMaybeJson(body));
    const type = asString(envelope.Type);
    if (type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation') return [];

    let message: Record<string, unknown>;
    if (type === 'Notification' || envelope.Message !== undefined) {
      message = asRecord(parseMaybeJson(envelope.Message));
    } else {
      message = envelope; // already the SES message
    }
    const kind = asString(message.notificationType) ?? asString(message.eventType);
    if (!kind) return [];

    const mail = asRecord(message.mail);
    const providerId = asString(mail.messageId);
    const events: ProviderEvent[] = [];

    switch (kind) {
      case 'Bounce': {
        const bounce = asRecord(message.bounce);
        const bounceType = asString(bounce.bounceType) ?? 'Undetermined';
        const subType = asString(bounce.bounceSubType);
        const hard = bounceType === 'Permanent';
        const recipients = Array.isArray(bounce.bouncedRecipients) ? bounce.bouncedRecipients : [];
        for (const r of recipients) {
          const rec = asRecord(r);
          const recipient = asString(rec.emailAddress);
          if (!recipient) continue;
          const diag = asString(rec.diagnosticCode);
          events.push({
            type: 'bounce',
            providerId,
            recipient,
            hard,
            reason: [bounceType, subType].filter(Boolean).join('/') + (diag ? `: ${diag}` : ''),
          });
        }
        break;
      }
      case 'Complaint': {
        const complaint = asRecord(message.complaint);
        const recipients = Array.isArray(complaint.complainedRecipients) ? complaint.complainedRecipients : [];
        for (const r of recipients) {
          const recipient = asString(asRecord(r).emailAddress);
          if (recipient) events.push({ type: 'complaint', providerId, recipient });
        }
        break;
      }
      case 'Delivery': {
        const delivery = asRecord(message.delivery);
        const recipients = Array.isArray(delivery.recipients) ? delivery.recipients : [];
        for (const r of recipients) {
          if (typeof r === 'string' && r) events.push({ type: 'delivered', providerId, recipient: r });
        }
        break;
      }
      default:
        break; // Send, Open, Click, Reject, DeliveryDelay, … are not mapped to ProviderEvent
    }
    return events;
  }
}
