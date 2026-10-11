import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ENV, Env } from '../../shared/config/config.module';

export type LinkPurpose = 'unsubscribe' | 'takedown' | 'quote' | 'track' | 'preview';

export interface LinkPayload {
  p: LinkPurpose;
  leadId: string;
  contactId?: string;
  messageId?: string;
  url?: string;
  exp?: number;
}

/** Signed, tamper-evident tokens for the public one-click links (unsubscribe, takedown, tracking). */
@Injectable()
export class LinkTokenService {
  private readonly secret: Buffer;
  constructor(@Inject(ENV) private readonly env: Env) {
    this.secret = createHmac('sha256', env.ADMIN_API_TOKEN).update('sitewright:links').digest();
  }

  sign(payload: LinkPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  verify(token: string, purpose: LinkPurpose): LinkPayload | null {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as LinkPayload;
      if (payload.p !== purpose) return null;
      if (payload.exp && payload.exp < Date.now() / 1000) return null;
      return payload;
    } catch {
      return null;
    }
  }

  unsubscribeUrl(leadId: string, contactId: string): string {
    return `${this.env.APP_BASE_URL}/u/${this.sign({ p: 'unsubscribe', leadId, contactId })}`;
  }

  takedownUrl(leadId: string): string {
    return `${this.env.APP_BASE_URL}/takedown/${this.sign({ p: 'takedown', leadId })}`;
  }
}
