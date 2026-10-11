import { Inject, Injectable } from '@nestjs/common';
import type { JurisdictionPolicy } from '@sitewright/shared-types';
import { ENV, Env } from '../../shared/config/config.module';
import { LinkTokenService } from './link-token.service';

export interface EmailBlockInput {
  leadId: string;
  contactId: string;
  policy: JurisdictionPolicy;
  /** Verbatim contact source (adapter name) and URL, quoted in the Art.14 notice. */
  contactSource: string;
  contactSourceUrl: string | null;
  languageCode?: string;
}

export interface EmailBlock {
  text: string;
  html: string;
  headers: Record<string, string>;
  unsubscribeUrl: string;
  takedownUrl: string;
}

/**
 * Mandatory content for every first email (spec §1.2), generated here and never by the copywriter LLM:
 * 1. sender legal entity, registration number, registered address
 * 2. why they were contacted
 * 3. GDPR Art.14 notice: source, purpose, legal basis, privacy notice link, right to object
 * 4. one-click unsubscribe link + List-Unsubscribe / List-Unsubscribe-Post headers
 * 5. one-click "delete the mockup you made" link
 */
@Injectable()
export class EmailBlockService {
  constructor(@Inject(ENV) private readonly env: Env, private readonly links: LinkTokenService) {}

  build(input: EmailBlockInput): EmailBlock {
    const unsubscribeUrl = this.links.unsubscribeUrl(input.leadId, input.contactId);
    const takedownUrl = this.links.takedownUrl(input.leadId);
    const e = this.env;
    const source = input.contactSourceUrl ? `${input.contactSource} (${input.contactSourceUrl})` : input.contactSource;

    const lines: string[] = [];
    lines.push('--');
    lines.push(`${e.LEGAL_ENTITY_NAME} · Reg. no. ${e.LEGAL_ENTITY_REG_NO}`);
    if (input.policy.requiresPhysicalAddressInFooter || true) lines.push(e.LEGAL_ENTITY_ADDRESS);
    lines.push('');
    lines.push('Why you received this: we identified your business on Google Maps as operating without a website.');
    if (input.policy.requiresDataSourceDisclosure) {
      lines.push(
        `How we got your details: your business listing is public on Google Maps; your email address came from ${source}. ` +
          `We use it for the sole purpose of offering website services to your business, on the basis of our legitimate interest (GDPR Art. 6(1)(f)). ` +
          `You have the right to object at any time. Privacy notice: ${e.PRIVACY_POLICY_URL} · Data protection contact: ${e.DPO_EMAIL}`,
      );
    } else {
      lines.push(`Your email address came from ${source}. Privacy notice: ${e.PRIVACY_POLICY_URL}`);
    }
    lines.push('');
    lines.push(`Not interested? Unsubscribe with one click (no further messages, ever): ${unsubscribeUrl}`);
    lines.push(`Delete the mockup we made for you: ${takedownUrl}`);

    const text = lines.join('\n');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html =
      `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">` +
      `<p style="font-size:12px;color:#555;line-height:1.5">` +
      `${esc(e.LEGAL_ENTITY_NAME)} · Reg. no. ${esc(e.LEGAL_ENTITY_REG_NO)}<br>${esc(e.LEGAL_ENTITY_ADDRESS)}<br><br>` +
      `<strong>Why you received this:</strong> we identified your business on Google Maps as operating without a website.<br>` +
      (input.policy.requiresDataSourceDisclosure
        ? `<strong>How we got your details:</strong> your business listing is public on Google Maps; your email address came from ${esc(source)}. ` +
          `We use it for the sole purpose of offering website services to your business, on the basis of our legitimate interest (GDPR Art. 6(1)(f)). ` +
          `You have the right to object at any time. <a href="${esc(e.PRIVACY_POLICY_URL)}">Privacy notice</a> · Data protection contact: ${esc(e.DPO_EMAIL)}<br>`
        : `Your email address came from ${esc(source)}. <a href="${esc(e.PRIVACY_POLICY_URL)}">Privacy notice</a><br>`) +
      `<br><a href="${unsubscribeUrl}">Unsubscribe with one click</a> (no further messages, ever) · ` +
      `<a href="${takedownUrl}">Delete the mockup we made for you</a></p>`;

    return {
      text,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${e.DPO_EMAIL}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Sitewright-Lead': input.leadId,
      },
      unsubscribeUrl,
      takedownUrl,
    };
  }

  /** Quick structural assertion used by the send path: a first email must contain all five mandatory items. */
  static assertComplete(block: EmailBlock, env: Env): void {
    const required = [env.LEGAL_ENTITY_NAME, env.LEGAL_ENTITY_REG_NO, env.LEGAL_ENTITY_ADDRESS, 'Google Maps', env.PRIVACY_POLICY_URL, block.unsubscribeUrl, block.takedownUrl];
    for (const r of required) if (!block.text.includes(r)) throw new Error(`compliance block missing required content: ${r}`);
    if (!block.headers['List-Unsubscribe'] || !block.headers['List-Unsubscribe-Post']) throw new Error('compliance block missing List-Unsubscribe headers');
  }
}
