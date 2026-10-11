export interface OutboundEmail {
  from: { address: string; name?: string };
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Extra RFC 5322 headers, e.g. List-Unsubscribe, List-Unsubscribe-Post. */
  headers: Record<string, string>;
  replyTo?: string;
  messageId?: string;
  tags?: Record<string, string>;
}

export interface SendResult {
  providerId: string;
  accepted: boolean;
  raw?: unknown;
}

export type ProviderEvent =
  | { type: 'bounce'; providerId: string | null; recipient: string; hard: boolean; reason: string }
  | { type: 'complaint'; providerId: string | null; recipient: string }
  | { type: 'delivered'; providerId: string | null; recipient: string }
  | {
      type: 'reply';
      providerId: string | null;
      recipient: string;
      from: string;
      subject: string | null;
      text: string;
      inReplyTo: string | null;
      references: string[];
      receivedAt: string;
    };

export interface EmailProvider {
  name: 'ses' | 'smartlead' | 'fake';
  send(email: OutboundEmail): Promise<SendResult>;
  /** Parse a provider notification (SES SNS JSON, Smartlead webhook) into normalised events. */
  parseWebhook(body: unknown, headers?: Record<string, string>): ProviderEvent[];
}

export interface InboundMessage {
  from: string;
  to: string[];
  subject: string | null;
  text: string;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** ISO 8601 */
  date: string;
  raw: string;
}

export interface InboundSource {
  name: string;
  poll(sinceUid?: number): Promise<{ messages: InboundMessage[]; lastUid: number }>;
}
