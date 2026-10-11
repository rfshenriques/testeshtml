import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, ReplyIntent } from '@sitewright/db';
import { REPLY_INTENTS } from '@sitewright/shared-types';
import { z } from 'zod';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../../shared/llm/llm.service';
import { SuppressionService } from '../compliance/suppression.service';
import { AuditService } from '../compliance/audit.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { AlertService } from '../ops/alert.service';
import { PreviewService } from '../preview/preview.service';
import { MailboxService } from './mailbox.service';
import { SequenceService } from './sequence.service';
import { SendService } from './send.service';
import { EMAIL_PROVIDER, EmailProvider, INBOUND_SOURCE, InboundMessage, InboundSource, ProviderEvent } from './email.types';
import { hashEmail } from '../compliance/suppression.util';

const UNSUB_RE = /\b(unsubscribe|opt[\s-]?out|remove me|take me off|stop (emailing|contacting|sending)|do not (contact|email)|no more emails|désinscri|desinscri|abmelden|darse de baja|cancellami|afmelden)\b/i;
const LEGAL_RE = /\b(gdpr|solicitor|lawyer|attorney|report(ing)? (you|this)|complaint|cease|desist|harass|spam|ico\b|data protection (commissioner|authority|officer)|dpa\b|idpc|garante|cnil|autoriteit persoonsgegevens|datatilsynet|legal action)\b/i;
const OOO_RE = /\b(out of (the )?office|on (annual )?leave|on holiday|on vacation|auto[\s-]?reply|automatic reply|away from (my )?(email|office)|will (be back|return)|limited access to email)\b/i;

const IntentSchema = z.object({ intent: z.enum(REPLY_INTENTS), confidence: z.number().min(0).max(1), summary: z.string().max(300) });

/**
 * Reply ingestion + classification (spec §11.7). Rules first (unsubscribe language, legal keywords
 * → hostile/unsubscribe, auto-reply → out_of_office), LLM for the rest at low temperature. Every
 * reply stops the sequence. Substantive replies are drafted, never auto-sent.
 */
@Injectable()
export class IngestService {
  private readonly log = new Logger(IngestService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INBOUND_SOURCE) private readonly inbound: InboundSource,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly llm: LlmService,
    private readonly suppression: SuppressionService,
    private readonly audit: AuditService,
    private readonly leadEvents: LeadEventsService,
    private readonly alerts: AlertService,
    private readonly preview: PreviewService,
    private readonly mailboxes: MailboxService,
    private readonly sequence: SequenceService,
    private readonly send: SendService,
  ) {}

  /** Poll the inbound source (IMAP every 2 min via the outreach.ingest queue). */
  async poll(): Promise<{ processed: number }> {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'ingest.lastUid' } });
    const since = Number(setting?.value ?? 0);
    const { messages, lastUid } = await this.inbound.poll(since);
    let processed = 0;
    for (const m of messages) {
      try {
        await this.handleInbound(m);
        processed++;
      } catch (e) {
        this.log.error({ from: m.from, err: (e as Error).message }, 'inbound handling failed');
      }
    }
    if (lastUid > since) await this.prisma.setting.upsert({ where: { key: 'ingest.lastUid' }, create: { key: 'ingest.lastUid', value: lastUid }, update: { value: lastUid } });
    return { processed };
  }

  /** Provider webhook (SES SNS / Smartlead): bounces, complaints, deliveries, replies. */
  async handleWebhook(body: unknown, headers: Record<string, string>): Promise<{ events: number }> {
    const events = this.provider.parseWebhook(body, headers);
    for (const e of events) await this.handleEvent(e);
    return { events: events.length };
  }

  async handleEvent(e: ProviderEvent) {
    const msg = e.providerId ? await this.prisma.outreachMessage.findFirst({ where: { providerId: e.providerId }, include: { lead: true, contact: true } }) : null;
    switch (e.type) {
      case 'delivered':
        if (msg && msg.status === 'sent') await this.prisma.outreachMessage.update({ where: { id: msg.id }, data: { status: 'delivered' } });
        return;
      case 'bounce': {
        if (msg) await this.prisma.outreachMessage.update({ where: { id: msg.id }, data: { status: 'bounced', error: e.reason } });
        if (e.hard) {
          await this.suppression.add({ email: e.recipient, leadId: msg?.leadId ?? null, reason: 'hard_bounce', actor: 'provider', note: e.reason, cascade: false });
          await this.prisma.contact.updateMany({ where: { email: e.recipient.toLowerCase() }, data: { verification: 'invalid', verifier: 'bounce' } });
          if (msg) await this.sequence.stop(msg.leadId, 'hard bounce');
        }
        await this.audit.log('email.bounced', { recipient: e.recipient, hard: e.hard, reason: e.reason }, { leadId: msg?.leadId ?? null, subjectId: msg?.id ?? null });
        if (msg) await this.mailboxes.enforceGuardrails(msg.mailboxId);
        return;
      }
      case 'complaint': {
        if (msg) await this.prisma.outreachMessage.update({ where: { id: msg.id }, data: { status: 'complained' } });
        await this.suppression.add({ email: e.recipient, leadId: msg?.leadId ?? null, reason: 'spam_complaint', actor: 'provider' });
        if (msg) { await this.sequence.stop(msg.leadId, 'spam complaint'); await this.preview.takedown(msg.leadId, 'hostile_reply', 'provider'); await this.mailboxes.enforceGuardrails(msg.mailboxId); }
        await this.alerts.raise('spam_complaint', 'critical', `Spam complaint from ${e.recipient}`, { leadId: msg?.leadId });
        await this.audit.log('email.complaint', { recipient: e.recipient }, { leadId: msg?.leadId ?? null, subjectId: msg?.id ?? null });
        return;
      }
      case 'reply':
        await this.handleInbound({ from: e.from, to: [e.recipient], subject: e.subject, text: e.text, html: null, messageId: null, inReplyTo: e.inReplyTo, references: e.references, date: e.receivedAt, raw: e.text });
        return;
    }
  }

  /** Thread matching via In-Reply-To / References, falling back to From + recent-send lookup. */
  async matchMessage(m: InboundMessage) {
    const ids = [m.inReplyTo, ...m.references].filter((x): x is string => !!x);
    if (ids.length) {
      const byHeader = await this.prisma.outreachMessage.findFirst({ where: { messageIdHeader: { in: ids } }, orderBy: { sentAt: 'desc' } });
      if (byHeader) return byHeader;
      const local = ids.map((i) => i.replace(/^<|@.*$/g, ''));
      const byId = await this.prisma.outreachMessage.findFirst({ where: { id: { in: local } } });
      if (byId) return byId;
    }
    const from = m.from.toLowerCase();
    return this.prisma.outreachMessage.findFirst({ where: { contact: { email: from }, sentAt: { not: null } }, orderBy: { sentAt: 'desc' } });
  }

  async handleInbound(m: InboundMessage) {
    const matched = await this.matchMessage(m);
    if (!matched) {
      this.log.log({ from: m.from, subject: m.subject }, 'inbound email did not match any send; ignored');
      return null;
    }
    const existing = m.messageId ? await this.prisma.reply.findFirst({ where: { leadId: matched.leadId, raw: { contains: m.messageId } } }) : null;
    if (existing) return existing;
    const text = (m.text || '').trim();
    const rules = this.rulesClassify(m.subject ?? '', text);
    let intent: ReplyIntent = rules.intent ?? 'other';
    let confidence = rules.intent ? 1 : 0;
    let classifiedBy = rules.intent ? 'rules' : 'llm';
    let summary = '';
    if (!rules.intent) {
      try {
        const { value } = await this.llm.completeJson({
          system: 'You classify replies to a B2B email about building a website. Respond with JSON only.',
          user: `Reply subject: ${m.subject ?? ''}\nReply text:\n"""${text.slice(0, 3000)}"""\n\nReturn {"intent": "<${REPLY_INTENTS.join('|')}>", "confidence": 0.0-1.0, "summary": "<one sentence>"}. Use "hostile" for anger, threats, or complaints; "unsubscribe" for any request to stop; "out_of_office" for auto-replies; "interested" when they want to proceed or see more; "question" when they ask something; "not_interested" for a polite no.`,
          temperature: 0, maxTokens: 200, purpose: 'reply_intent', leadId: matched.leadId,
        }, IntentSchema);
        intent = value.intent; confidence = value.confidence; summary = value.summary;
      } catch (e) {
        this.log.warn({ err: (e as Error).message }, 'LLM intent classification failed; routing to operator as "other"');
        intent = 'other'; confidence = 0; classifiedBy = 'fallback';
      }
    }
    const reply = await this.prisma.reply.create({
      data: { leadId: matched.leadId, messageId: matched.id, fromEmail: m.from.toLowerCase(), receivedAt: new Date(m.date || Date.now()), subject: m.subject, raw: m.raw.slice(0, 50_000), intent, confidence, classifiedBy, handled: false },
    });
    await this.prisma.outreachMessage.update({ where: { id: matched.id }, data: { status: 'replied' } }).catch(() => undefined);
    await this.leadEvents.emit(matched.leadId, 'reply.received', { replyId: reply.id, intent, confidence, classifiedBy, summary });
    await this.audit.log('reply.classified', { replyId: reply.id, intent, confidence, classifiedBy, rule: rules.rule }, { leadId: matched.leadId, subjectId: reply.id });
    await this.act(reply.id, intent, m);
    await this.mailboxes.enforceGuardrails(matched.mailboxId).catch(() => undefined);
    return reply;
  }

  rulesClassify(subject: string, text: string): { intent: ReplyIntent | null; rule: string | null } {
    const body = `${subject}\n${text}`;
    if (LEGAL_RE.test(body)) return { intent: 'hostile', rule: 'legal keywords' };
    if (UNSUB_RE.test(body)) return { intent: 'unsubscribe', rule: 'unsubscribe language' };
    if (OOO_RE.test(body)) return { intent: 'out_of_office', rule: 'auto-reply' };
    return { intent: null, rule: null };
  }

  /** Intent → action (spec §11.7). */
  async act(replyId: string, intent: ReplyIntent, m: InboundMessage) {
    const reply = await this.prisma.reply.findUniqueOrThrow({ where: { id: replyId }, include: { lead: true } });
    const leadId = reply.leadId;
    if (intent !== 'out_of_office') await this.sequence.stop(leadId, `reply: ${intent}`);
    switch (intent) {
      case 'hostile':
        await this.suppression.suppressLead(leadId, 'hostile_reply', { actor: 'system', note: 'hostile reply' });
        await this.preview.takedown(leadId, 'hostile_reply', 'system');
        await this.alerts.raise('hostile_reply', 'critical', `Hostile reply from ${reply.fromEmail} (${reply.lead.businessName}). No automated response was sent.`, { leadId, replyId });
        await this.prisma.reply.update({ where: { id: replyId }, data: { handled: true } });
        break;
      case 'unsubscribe':
        await this.suppression.suppressLead(leadId, 'unsubscribe', { actor: 'recipient' });
        await this.preview.takedown(leadId, 'unsubscribe', 'recipient');
        await this.send.sendUnsubscribeConfirmation({ id: replyId, leadId, fromEmail: reply.fromEmail, messageId: reply.messageId });
        await this.prisma.reply.update({ where: { id: replyId }, data: { handled: true } });
        break;
      case 'out_of_office':
        await this.sequence.postpone(leadId, 7);
        await this.prisma.reply.update({ where: { id: replyId }, data: { handled: true } });
        break;
      case 'not_interested':
        await this.suppression.suppressLead(leadId, 'not_interested', { actor: 'recipient' });
        await this.prisma.reply.update({ where: { id: replyId }, data: { handled: true } });
        break;
      case 'interested':
      case 'question':
      case 'other': {
        await this.leadEvents.advance(leadId, 'replied', { replyId });
        await this.alerts.raise('reply_received', 'info', `${reply.lead.businessName} replied (${intent})`, { leadId, replyId });
        const draft = await this.draft(reply.lead.businessName, m.text).catch(() => null);
        await this.prisma.reply.update({ where: { id: replyId }, data: { suggestedDraft: draft } });
        await this.prisma.reviewItem.create({ data: { leadId, type: 'reply_draft', payload: { replyId, intent, draft } as Prisma.InputJsonValue } });
        break;
      }
    }
  }

  /** Suggested reply draft for a human to edit and send. Never sent automatically. */
  async draft(businessName: string, text: string): Promise<string> {
    const r = await this.llm.complete({
      system: 'You draft short, plain-text replies on behalf of a small web studio. Be warm and concise (under 120 words). Never promise prices, dates, or features not mentioned. Never mention that you are an AI. Sign off with a line break and nothing else; a human will add their name.',
      user: `Business: ${businessName}\nTheir reply:\n"""${text.slice(0, 3000)}"""\n\nDraft our reply.`,
      temperature: 0.4, maxTokens: 400, purpose: 'reply_draft',
    });
    return r.text.trim();
  }

  async inbox(filter: { handled?: boolean; intent?: ReplyIntent }) {
    const rows = await this.prisma.reply.findMany({ where: { ...(filter.handled !== undefined ? { handled: filter.handled } : {}), ...(filter.intent ? { intent: filter.intent } : {}) }, orderBy: { receivedAt: 'desc' }, include: { lead: { select: leadSelect } }, take: 300 });
    return rows.map((r) => ({ ...r, lead: summarise(r.lead) }));
  }

  async reclassify(replyId: string, intent: ReplyIntent, actor: string) {
    const reply = await this.prisma.reply.findUniqueOrThrow({ where: { id: replyId } });
    const updated = await this.prisma.reply.update({ where: { id: replyId }, data: { intent, confidence: 1, classifiedBy: `operator:${actor}` } });
    await this.audit.log('reply.reclassified', { from: reply.intent, to: intent }, { actor, leadId: reply.leadId, subjectId: replyId });
    if (intent !== reply.intent && ['hostile', 'unsubscribe', 'not_interested'].includes(intent)) {
      await this.act(replyId, intent, { from: reply.fromEmail, to: [], subject: reply.subject, text: reply.raw, html: null, messageId: null, inReplyTo: null, references: [], date: reply.receivedAt.toISOString(), raw: reply.raw });
    }
    return updated;
  }

  emailHashFor(email: string) {
    return hashEmail(email);
  }
}
import { leadSummarySelect as leadSelect, toLeadSummary as summarise } from '../crm/lead-summary';
