import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BlockedError } from '../../shared/errors/errors';
import { JurisdictionService } from './jurisdiction.service';
import { SuppressionService } from './suppression.service';
import { AuditService } from './audit.service';
import { evaluateGate, GateResult, OVERRIDABLE_REASONS, GateReason } from './gate.rules';
import { LeadEventsService } from '../crm/lead-events.service';

/**
 * Legal gate (spec §8). Runs after enrichment, before generation, and again immediately before
 * every send. Persists the verdict on the lead, opens a review item when blocked, and audits
 * every decision. Nothing may be sent unless `assertClear` passes at dispatch time.
 */
@Injectable()
export class GateService {
  private readonly log = new Logger(GateService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jurisdictions: JurisdictionService,
    private readonly suppression: SuppressionService,
    private readonly audit: AuditService,
    private readonly leadEvents: LeadEventsService,
  ) {}

  async evaluate(leadId: string, opts: { contactId?: string; persist?: boolean; context?: string } = {}): Promise<GateResult> {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contacts: true } });
    const policy = await this.jurisdictions.get(lead.countryCode);
    const contact = opts.contactId ? lead.contacts.find((c) => c.id === opts.contactId) ?? null : lead.contacts.find((c) => c.isPrimary) ?? null;
    const sup = await this.suppression.isSuppressed({ email: contact?.email ?? null, placeId: lead.placeId, domain: lead.websiteUrl ?? null });
    const override = lead.gateOverride as { reason: string; justification: string } | null;
    const result = evaluateGate({
      countryCode: lead.countryCode,
      businessName: lead.businessName,
      reviewCount: lead.reviewCount,
      policy,
      suppressed: sup.suppressed || lead.stage === 'suppressed',
      primaryContact: contact ? { email: contact.email, verification: contact.verification, source: contact.source, sourceUrl: contact.sourceUrl } : null,
      override,
    });
    if (opts.persist ?? true) await this.persist(lead.id, lead.legalGate, result, opts.context ?? 'evaluate');
    return result;
  }

  /** Dispatch-time check: throws BlockedError unless the gate is clear right now. */
  async assertClear(leadId: string, contactId?: string): Promise<GateResult> {
    const result = await this.evaluate(leadId, { contactId, persist: true, context: 'dispatch' });
    if (result.result !== 'clear') {
      throw new BlockedError(`legal gate blocked: ${result.reason}`, { leadId, reason: result.reason, detail: result.detail });
    }
    return result;
  }

  private async persist(leadId: string, previous: string, result: GateResult, context: string) {
    const changed = previous !== result.result;
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: { legalGate: result.result, legalGateReason: result.reason ? `${result.reason}${result.detail ? `: ${result.detail}` : ''}` : null },
      });
      await this.audit.log('gate.evaluated', { context, ...result }, { leadId, tx });
      if (changed) await this.leadEvents.emit(leadId, 'gate.changed', { from: previous, to: result.result, reason: result.reason, detail: result.detail }, tx);
      if (result.result === 'blocked' && result.reason && OVERRIDABLE_REASONS.has(result.reason)) {
        const open = await tx.reviewItem.findFirst({ where: { leadId, type: 'legal_gate_block', status: 'open' } });
        if (!open) {
          await tx.reviewItem.create({
            data: { leadId, type: 'legal_gate_block', payload: { reason: result.reason, detail: result.detail } as Prisma.InputJsonValue },
          });
        }
      }
    });
  }

  /** Operator override with a written justification (spec §8). Only overridable reasons; always logged. */
  async override(leadId: string, reason: GateReason, justification: string, actor: string): Promise<GateResult> {
    if (!OVERRIDABLE_REASONS.has(reason)) throw new BlockedError(`gate reason "${reason}" cannot be overridden`, { reason });
    if (!justification || justification.trim().length < 20) throw new BlockedError('a written justification of at least 20 characters is required');
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { gateOverride: { reason, justification, actor, at: new Date().toISOString() } } });
      await this.audit.log('gate.overridden', { reason, justification }, { actor, leadId, tx });
      await this.leadEvents.emit(leadId, 'gate.overridden', { reason, justification, actor }, tx);
      await tx.reviewItem.updateMany({
        where: { leadId, type: 'legal_gate_block', status: 'open' },
        data: { status: 'approved', resolvedBy: actor, resolvedAt: new Date(), resolution: { justification } },
      });
    });
    this.log.warn({ leadId, reason, actor }, 'legal gate overridden');
    return this.evaluate(leadId, { context: 'override' });
  }
}
