import { Inject, Injectable, Logger } from '@nestjs/common';
import { OutreachMessage, Prisma } from '@sitewright/db';
import { MAX_TOUCHES_PER_BUSINESS } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { KillSwitchService } from '../ops/kill-switch.service';
import { KillSwitchError, BlockedError } from '../../shared/errors/errors';
import { GateService } from '../compliance/gate.service';
import { SuppressionService } from '../compliance/suppression.service';
import { EmailBlockService } from '../compliance/email-block.service';
import { JurisdictionService } from '../compliance/jurisdiction.service';
import { AuditService } from '../compliance/audit.service';
import { LinkTokenService } from '../compliance/link-token.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { CostLedgerService } from '../ops/cost-ledger.service';
import { MailboxService } from './mailbox.service';
import { SequenceService } from './sequence.service';
import { EMAIL_PROVIDER, EmailProvider, OutboundEmail } from './email.types';

export type DispatchOutcome = { sent: true; providerId: string } | { sent: false; reason: string; terminal: boolean };

/**
 * Dispatch (spec §1.3, §8, §11, §20). Every check runs at send time, not queue time:
 * kill switch → message still queued → approval → lead not terminal → suppression → legal gate
 * (fresh) → touches < 4 → mailbox active + daily cap (atomic) → compliance block complete → send.
 */
@Injectable()
export class SendService {
  private readonly log = new Logger(SendService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly killSwitch: KillSwitchService,
    private readonly gate: GateService,
    private readonly suppression: SuppressionService,
    private readonly emailBlock: EmailBlockService,
    private readonly jurisdictions: JurisdictionService,
    private readonly audit: AuditService,
    private readonly links: LinkTokenService,
    private readonly leadEvents: LeadEventsService,
    private readonly costs: CostLedgerService,
    private readonly mailboxes: MailboxService,
    private readonly sequence: SequenceService,
  ) {}

  async dispatch(messageId: string): Promise<DispatchOutcome> {
    if (await this.killSwitch.isEngaged()) throw new KillSwitchError();
    const msg = await this.prisma.outreachMessage.findUnique({ where: { id: messageId }, include: { contact: true, mailbox: true, lead: true } });
    if (!msg) return { sent: false, reason: 'message not found', terminal: true };
    if (msg.status !== 'queued') return { sent: false, reason: `message is ${msg.status}`, terminal: true };
    if (msg.requiresApproval && !msg.approvedAt) return { sent: false, reason: 'awaiting hand approval', terminal: false };
    const fail = async (reason: string, status: 'cancelled' | 'failed' = 'cancelled'): Promise<DispatchOutcome> => {
      await this.prisma.outreachMessage.update({ where: { id: messageId }, data: { status, error: reason } });
      await this.audit.log('email.blocked', { messageId, reason }, { leadId: msg.leadId, subjectId: messageId });
      await this.leadEvents.emit(msg.leadId, 'message.blocked', { messageId, reason });
      return { sent: false, reason, terminal: true };
    };
    if (msg.lead.stage === 'suppressed' || msg.lead.sequenceStoppedAt) return fail(msg.lead.stage === 'suppressed' ? 'lead suppressed' : `sequence stopped: ${msg.lead.sequenceStopReason}`);
    const sup = await this.suppression.isSuppressed({ email: msg.contact.email, placeId: msg.lead.placeId, domain: msg.lead.websiteUrl });
    if (sup.suppressed) return fail(`suppressed (${sup.matches.join(', ')})`);
    try {
      await this.gate.assertClear(msg.leadId, msg.contactId);
    } catch (e) {
      if (e instanceof BlockedError) return fail(`legal gate: ${(e.details as any)?.reason ?? e.message}`);
      throw e;
    }
    if (msg.contact.verification !== 'valid') return fail('contact not verified');
    const touches = await this.prisma.outreachMessage.count({ where: { lead: { placeId: msg.lead.placeId }, kind: { in: ['sequence', 'bridge'] }, sentAt: { not: null } } });
    if (msg.kind !== 'reply' && msg.kind !== 'confirmation' && touches >= MAX_TOUCHES_PER_BUSINESS) return fail(`max ${MAX_TOUCHES_PER_BUSINESS} touches reached`);
    if (msg.mailbox.status !== 'active' && msg.mailbox.status !== 'warming') return fail(`mailbox ${msg.mailbox.status}`, 'failed');

    const policy = await this.jurisdictions.get(msg.lead.countryCode);
    if (!policy) return fail('no jurisdiction policy');
    const block = this.emailBlock.build({ leadId: msg.leadId, contactId: msg.contactId, policy, contactSource: msg.contact.source, contactSourceUrl: msg.contact.sourceUrl });
    EmailBlockService.assertComplete(block, this.env);

    // Reserve mailbox + global capacity atomically; release on failure.
    let release: (() => Promise<void>) | null = null;
    try {
      release = await this.mailboxes.reserveSend(msg.mailbox);
    } catch (e) {
      // Not terminal: reschedule for the next slot tomorrow.
      const at = new Date(Date.now() + 24 * 3600_000);
      await this.prisma.outreachMessage.update({ where: { id: messageId }, data: { scheduledFor: at } });
      await this.sequence.enqueueSend({ ...msg, scheduledFor: at } as OutreachMessage);
      return { sent: false, reason: (e as Error).message, terminal: false };
    }

    const text = `${this.trackLinks(msg.leadId, messageId, msg.bodyText)}\n\n${block.text}`;
    const messageIdHeader = `<${messageId}@${msg.mailbox.sendingDomain}>`;
    const email: OutboundEmail = {
      from: { address: msg.mailbox.address, name: this.env.AGENCY_NAME }, to: msg.contact.email, subject: msg.subject, text,
      headers: { ...block.headers, 'Message-ID': messageIdHeader, 'X-Sitewright-Message': messageId }, replyTo: msg.mailbox.address, messageId: messageIdHeader,
      tags: { leadId: msg.leadId, messageId, step: String(msg.sequenceStep) },
    };
    try {
      const res = await this.provider.send(email);
      const sentAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.outreachMessage.update({ where: { id: messageId }, data: { status: 'sent', sentAt, providerId: res.providerId, bodyText: text, messageIdHeader } });
        await tx.mailbox.update({ where: { id: msg.mailboxId }, data: { lastSentAt: sentAt, sentToday: { increment: 1 }, sentTodayDate: sentAt } });
        await tx.lead.update({ where: { id: msg.leadId }, data: { lastTouchAt: sentAt, stage: msg.lead.stage === 'quoted' || msg.lead.stage === 'generated' ? 'contacted' : msg.lead.stage } });
        await this.audit.log('email.sent', { messageId, to: msg.contact.email, step: msg.sequenceStep, kind: msg.kind, mailbox: msg.mailbox.address, providerId: res.providerId, subject: msg.subject }, { leadId: msg.leadId, subjectId: messageId, tx });
      });
      await this.leadEvents.emit(msg.leadId, 'message.sent', { messageId, step: msg.sequenceStep, kind: msg.kind, providerId: res.providerId });
      await this.costs.record({ category: 'email_send', units: 1, usd: 0.0001, provider: this.provider.name, leadId: msg.leadId, campaignId: msg.lead.campaignId });
      await this.mailboxes.enforceGuardrails(msg.mailboxId).catch((e) => this.log.warn(`guardrails: ${e}`));
      if (msg.kind === 'sequence' || msg.kind === 'bridge') await this.sequence.afterSent({ ...msg, sentAt } as OutreachMessage).catch((e) => this.log.warn({ leadId: msg.leadId, err: (e as Error).message }, 'next step not scheduled'));
      return { sent: true, providerId: res.providerId };
    } catch (e) {
      if (release) await release();
      await this.prisma.outreachMessage.update({ where: { id: messageId }, data: { status: 'failed', error: (e as Error).message } });
      await this.audit.log('email.failed', { messageId, error: (e as Error).message }, { leadId: msg.leadId, subjectId: messageId });
      throw e;
    }
  }

  /** Rewrite preview/quote links through our own tracking host (spec §11.6: never a shared shortener). */
  trackLinks(leadId: string, messageId: string, text: string): string {
    return text.replace(/https?:\/\/[^\s)]+/g, (url) => {
      if (url.startsWith(this.env.TRACKING_HOST) || url.includes('/u/') || url.includes('/takedown/')) return url;
      return `${this.env.TRACKING_HOST.replace(/\/$/, '')}/${this.links.sign({ p: 'track', leadId, messageId, url })}`;
    });
  }

  async recordClick(token: string): Promise<string | null> {
    const payload = this.links.verify(token, 'track');
    if (!payload?.url) return null;
    if (payload.messageId) {
      await this.prisma.outreachMessage.updateMany({ where: { id: payload.messageId, status: { in: ['sent', 'delivered', 'opened'] } }, data: { status: 'clicked' } }).catch(() => undefined);
      await this.prisma.outreachMessage.update({ where: { id: payload.messageId }, data: { clicks: { increment: 1 } } }).catch(() => undefined);
    }
    await this.leadEvents.emit(payload.leadId, 'message.clicked', { messageId: payload.messageId, url: payload.url }).catch(() => undefined);
    return payload.url;
  }

  /** Render a queued message exactly as it would be sent (admin preview). */
  async preview(messageId: string) {
    const msg = await this.prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId }, include: { contact: true, mailbox: true, lead: true } });
    const policy = await this.jurisdictions.get(msg.lead.countryCode);
    const block = policy ? this.emailBlock.build({ leadId: msg.leadId, contactId: msg.contactId, policy, contactSource: msg.contact.source, contactSourceUrl: msg.contact.sourceUrl }) : null;
    const bodyText = msg.status === 'queued' && block ? `${this.trackLinks(msg.leadId, messageId, msg.bodyText)}\n\n${block.text}` : msg.bodyText;
    return { subject: msg.subject, from: msg.mailbox.address, to: msg.contact.email, bodyText, bodyHtml: block?.html ?? '', headers: block?.headers ?? {}, policyOk: !!policy };
  }

  /** Human-confirmed substantive reply (never automatic). Not a sequence touch. */
  async sendHumanReply(replyId: string, body: string, actor: string) {
    const reply = await this.prisma.reply.findUniqueOrThrow({ where: { id: replyId }, include: { lead: true, message: { include: { mailbox: true, contact: true } } } });
    if (await this.killSwitch.isEngaged()) throw new KillSwitchError();
    if (reply.lead.stage === 'suppressed') throw new BlockedError('lead is suppressed');
    const sup = await this.suppression.isSuppressed({ email: reply.fromEmail, placeId: reply.lead.placeId });
    if (sup.suppressed) throw new BlockedError('recipient is suppressed');
    const mailbox = reply.message?.mailbox ?? (await this.prisma.mailbox.findFirst({ where: { status: { in: ['active', 'warming'] } } }));
    if (!mailbox) throw new Error('no mailbox available');
    const contact = reply.message?.contact ?? (await this.prisma.contact.findFirst({ where: { leadId: reply.leadId, email: reply.fromEmail } }));
    if (!contact) throw new Error('no contact record for the reply address');
    const subject = reply.subject && /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject ?? reply.message?.subject ?? 'your website'}`;
    const messageIdHeader = `<${replyId}-${Date.now()}@${mailbox.sendingDomain}>`;
    const footer = `\n\n--\n${this.env.AGENCY_NAME} · ${this.env.LEGAL_ENTITY_NAME} · ${this.env.LEGAL_ENTITY_ADDRESS}`;
    const res = await this.provider.send({
      from: { address: mailbox.address, name: this.env.AGENCY_NAME }, to: reply.fromEmail, subject, text: body + footer,
      headers: { 'Message-ID': messageIdHeader, ...(reply.message?.messageIdHeader ? { 'In-Reply-To': reply.message.messageIdHeader, References: reply.message.messageIdHeader } : {}) }, messageId: messageIdHeader, replyTo: mailbox.address,
    });
    const msg = await this.prisma.outreachMessage.create({ data: { leadId: reply.leadId, contactId: contact.id, sequenceStep: 0, kind: 'reply', mailboxId: mailbox.id, subject, bodyText: body + footer, bodyHtml: '', status: 'sent', sentAt: new Date(), providerId: res.providerId, messageIdHeader, approvedAt: new Date(), approvedBy: actor } });
    await this.prisma.reply.update({ where: { id: replyId }, data: { handled: true } });
    await this.audit.log('email.reply_sent', { replyId, messageId: msg.id, to: reply.fromEmail }, { actor, leadId: reply.leadId, subjectId: msg.id });
    await this.leadEvents.emit(reply.leadId, 'reply.answered', { replyId, messageId: msg.id, actor });
    return msg;
  }

  /** Single plain confirmation after an unsubscribe reply (spec §11.7). Transactional, not a touch. */
  async sendUnsubscribeConfirmation(reply: { id: string; leadId: string; fromEmail: string; messageId: string | null }) {
    const message = reply.messageId ? await this.prisma.outreachMessage.findUnique({ where: { id: reply.messageId }, include: { mailbox: true, contact: true } }) : null;
    const mailbox = message?.mailbox ?? (await this.prisma.mailbox.findFirst({ where: { status: { in: ['active', 'warming'] } } }));
    if (!mailbox) return null;
    const text = `You have been removed from our list and will not hear from us again. Any concept mockup we prepared has been deleted.\n\n--\n${this.env.LEGAL_ENTITY_NAME} · ${this.env.LEGAL_ENTITY_ADDRESS}`;
    const res = await this.provider.send({ from: { address: mailbox.address, name: this.env.AGENCY_NAME }, to: reply.fromEmail, subject: 'confirmed: you are unsubscribed', text, headers: message?.messageIdHeader ? { 'In-Reply-To': message.messageIdHeader } : {} }).catch((e) => { this.log.warn(`unsubscribe confirmation failed: ${e}`); return null; });
    if (!res) return null;
    const contactId = message?.contactId ?? (await this.prisma.contact.findFirst({ where: { leadId: reply.leadId } }))?.id;
    if (!contactId) return null;
    const msg = await this.prisma.outreachMessage.create({ data: { leadId: reply.leadId, contactId, sequenceStep: 0, kind: 'confirmation', mailboxId: mailbox.id, subject: 'confirmed: you are unsubscribed', bodyText: text, bodyHtml: '', status: 'sent', sentAt: new Date(), providerId: res.providerId } });
    await this.audit.log('email.unsubscribe_confirmation', { replyId: reply.id }, { leadId: reply.leadId, subjectId: msg.id });
    return msg;
  }
}
