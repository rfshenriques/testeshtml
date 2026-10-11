import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { JurisdictionService } from './jurisdiction.service';
import { SuppressionService, SuppressionReason } from './suppression.service';
import { AuditService } from './audit.service';
import { GateService } from './gate.service';
import { RetentionService } from './retention.service';
import { LinkTokenService } from './link-token.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { GateReason } from './gate.rules';
import type { JurisdictionPolicy } from '@sitewright/shared-types';

/** Public, unauthenticated one-click unsubscribe (spec §1.2 item 4). Suppression is written synchronously before the 200. */
@Controller('u')
export class UnsubscribeController {
  constructor(private readonly links: LinkTokenService, private readonly suppression: SuppressionService, private readonly prisma: PrismaService) {}

  private async handle(token: string) {
    const payload = this.links.verify(token, 'unsubscribe');
    if (!payload) return { ok: false, html: page('This link is not valid.', 'If you want to stop receiving messages from us, reply with "unsubscribe" and we will honour it.') };
    const contact = payload.contactId ? await this.prisma.contact.findUnique({ where: { id: payload.contactId } }) : null;
    await this.suppression.add({ email: contact?.email ?? null, leadId: payload.leadId, reason: 'unsubscribe', actor: 'recipient' });
    await this.suppression.suppressLead(payload.leadId, 'unsubscribe', { actor: 'recipient' }).catch(() => undefined);
    return { ok: true, html: page('You are unsubscribed.', 'You will not receive any further messages from us. The mockup we prepared has been scheduled for deletion.') };
  }

  @Get(':token')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('x-robots-tag', 'noindex, nofollow, noarchive')
  async get(@Param('token') token: string) {
    return (await this.handle(token)).html;
  }

  /** RFC 8058 one-click: mail clients POST `List-Unsubscribe=One-Click` here. */
  @Post(':token')
  @HttpCode(200)
  @Header('content-type', 'text/html; charset=utf-8')
  async post(@Param('token') token: string) {
    return (await this.handle(token)).html;
  }
}

export function page(title: string, body: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222;line-height:1.5}</style></head><body><h1>${esc(title)}</h1><p>${esc(body)}</p></body></html>`;
}

@Controller('admin/compliance')
@UseGuards(AdminTokenGuard)
export class ComplianceAdminController {
  constructor(
    private readonly jurisdictions: JurisdictionService,
    private readonly suppression: SuppressionService,
    private readonly audit: AuditService,
    private readonly gate: GateService,
    private readonly retention: RetentionService,
  ) {}

  @Get('jurisdictions')
  listJurisdictions() {
    return this.jurisdictions.list();
  }

  @Put('jurisdictions/:cc')
  upsertJurisdiction(@Param('cc') cc: string, @Body() body: JurisdictionPolicy & { confirmedByCounsel?: boolean }, @Req() req: any) {
    return this.jurisdictions.upsert({ ...body, countryCode: cc }, req.actor);
  }

  @Get('suppressions')
  async listSuppressions(@Query() q: Record<string, string>) {
    const [items, total] = await Promise.all([
      this.suppression.search({ email: q.email, placeId: q.placeId, domain: q.domain, reason: q.reason, take: Number(q.take ?? 100), skip: Number(q.skip ?? 0) }),
      this.suppression.count(),
    ]);
    return { items, total };
  }

  /** Add only. No removal endpoint exists (spec §1.3). */
  @Post('suppressions')
  async addSuppression(@Body() body: { email?: string; placeId?: string; domain?: string; reason?: SuppressionReason; note?: string; leadId?: string }, @Req() req: any) {
    await this.suppression.add({ ...body, reason: body.reason ?? 'operator', actor: req.actor, cascade: false });
    return { ok: true };
  }

  @Get('audit')
  queryAudit(@Query() q: Record<string, string>) {
    return this.audit.query({
      action: q.action, leadId: q.leadId,
      since: q.since ? new Date(q.since) : undefined, until: q.until ? new Date(q.until) : undefined,
      take: q.take ? Number(q.take) : undefined, skip: q.skip ? Number(q.skip) : undefined,
    });
  }

  @Get('retention')
  retentionStatus() {
    return this.retention.status();
  }

  @Post('retention/run')
  runRetention() {
    return this.retention.runAll();
  }

  @Post('leads/:id/gate/evaluate')
  evaluate(@Param('id') id: string) {
    return this.gate.evaluate(id, { context: 'operator' });
  }

  @Post('leads/:id/gate/override')
  override(@Param('id') id: string, @Body() body: { reason: GateReason; justification: string }, @Req() req: any) {
    return this.gate.override(id, body.reason, body.justification, req.actor);
  }
}
