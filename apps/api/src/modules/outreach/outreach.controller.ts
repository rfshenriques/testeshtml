import { All, Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ReplyIntent } from '@sitewright/db';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { MailboxService } from './mailbox.service';
import { SequenceService } from './sequence.service';
import { SendService } from './send.service';
import { IngestService } from './ingest.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Controller()
export class OutreachPublicController {
  constructor(private readonly ingest: IngestService, private readonly send: SendService) {}

  /** Provider notifications (SES via SNS, Smartlead). Signature handling lives in the adapter. */
  @All('webhooks/email')
  async emailWebhook(@Body() body: unknown, @Headers() headers: Record<string, string>, @Req() req: Request) {
    const raw = (req as any).rawBody ? (req as any).rawBody.toString() : body;
    return this.ingest.handleWebhook(typeof raw === 'string' && raw.trim().startsWith('{') ? safeJson(raw) ?? body : body, headers);
  }

  /** Click tracking redirect on our own tracking host (spec §11.6). */
  @Get('t/:token')
  async track(@Param('token') token: string, @Res() res: Response) {
    const url = await this.send.recordClick(token);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (!url) return res.status(404).send('invalid link');
    return res.redirect(302, url);
  }
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class OutreachAdminController {
  constructor(private readonly mailboxes: MailboxService, private readonly sequence: SequenceService, private readonly send: SendService, private readonly ingest: IngestService, private readonly prisma: PrismaService) {}

  @Get('outreach/sequence') sequenceConfig() { return this.sequence.config(); }
  @Put('outreach/sequence') updateSequence(@Body() body: { steps: unknown }, @Req() req: any) { return this.sequence.updateConfig(body.steps, req.actor); }

  @Get('outreach/domains')
  async domains() {
    const rows = await this.prisma.sendingDomain.findMany({ include: { mailboxes: true }, orderBy: { domain: 'asc' } });
    return rows.map((d) => ({ ...d, mailboxes: d.mailboxes.map((m) => ({ ...m, warmupStage: MailboxService.warmupCap(m.warmupStartedAt).week - 1 })) }));
  }
  @Post('outreach/domains') addDomain(@Body() body: { domain: string }, @Req() req: any) { return this.mailboxes.addDomain(body.domain, req.actor); }
  @Post('outreach/domains/:id/pause') async pauseDomain(@Param('id') id: string) { await this.prisma.sendingDomain.update({ where: { id }, data: { status: 'paused' } }); return { ok: true }; }
  @Post('outreach/domains/:id/resume') async resumeDomain(@Param('id') id: string) {
    const d = await this.prisma.sendingDomain.findUniqueOrThrow({ where: { id } });
    if (d.status === 'burned') return { ok: false, error: 'domain is burned permanently' };
    await this.prisma.sendingDomain.update({ where: { id }, data: { status: 'active' } });
    return { ok: true };
  }

  @Get('outreach/mailboxes') mailboxList() { return this.mailboxes.list(); }
  @Post('outreach/mailboxes') addMailbox(@Body() body: { address: string; sendingDomain: string }, @Req() req: any) { return this.mailboxes.addMailbox(body.address, body.sendingDomain, req.actor); }
  @Patch('outreach/mailboxes/:id') setCap(@Param('id') id: string, @Body() body: { dailyCap: number }, @Req() req: any) { return this.mailboxes.setDailyCap(id, Number(body.dailyCap), req.actor); }
  @Post('outreach/mailboxes/:id/pause') pauseMailbox(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req: any) { return this.mailboxes.pause(id, body?.reason ?? 'operator', req.actor); }
  @Post('outreach/mailboxes/:id/resume') resumeMailbox(@Param('id') id: string, @Req() req: any) { return this.mailboxes.resume(id, req.actor); }

  @Get('outreach/schedule') schedule(@Query('days') days?: string) { return this.sequence.scheduleOverview(days ? Number(days) : 7); }
  @Get('outreach/capacity') capacity() { return this.mailboxes.capacity(); }
  @Get('outreach/reputation')
  async reputation(@Query('days') daysRaw?: string) {
    const days = Math.min(90, Number(daysRaw ?? 30));
    const since = new Date(Date.now() - days * 86400_000);
    const boxes = await this.prisma.mailbox.findMany({ orderBy: { address: 'asc' } });
    const msgs = await this.prisma.outreachMessage.findMany({ where: { sentAt: { gte: since } }, select: { mailboxId: true, sentAt: true, status: true, replies: { select: { id: true } } } });
    return boxes.map((mb) => {
      const byDay = new Map<string, { day: string; sent: number; bounced: number; complained: number; replied: number }>();
      for (const m of msgs.filter((x) => x.mailboxId === mb.id)) {
        const day = m.sentAt!.toISOString().slice(0, 10);
        const row = byDay.get(day) ?? { day, sent: 0, bounced: 0, complained: 0, replied: 0 };
        row.sent++; if (m.status === 'bounced') row.bounced++; if (m.status === 'complained') row.complained++; if (m.replies.length) row.replied++;
        byDay.set(day, row);
      }
      return { mailboxId: mb.id, address: mb.address, series: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)) };
    });
  }

  @Get('outreach/approval-queue') approvalQueue() { return this.sequence.approvalQueue(); }
  @Post('outreach/messages/:id/approve') approve(@Param('id') id: string, @Req() req: any) { return this.sequence.approve(id, req.actor); }
  @Post('outreach/messages/:id/cancel') cancel(@Param('id') id: string, @Req() req: any) { return this.sequence.cancel(id, req.actor); }
  @Get('outreach/messages') messages(@Query('leadId') leadId?: string, @Query('status') status?: string, @Query('take') take?: string) {
    return this.prisma.outreachMessage.findMany({ where: { ...(leadId ? { leadId } : {}), ...(status ? { status: status as any } : {}) }, orderBy: { createdAt: 'desc' }, take: Math.min(500, Number(take ?? 100)) });
  }
  @Get('outreach/messages/:id/preview') preview(@Param('id') id: string) { return this.send.preview(id); }
  @Post('outreach/leads/:id/enqueue') async enqueue(@Param('id') id: string, @Req() req: any) { return this.sequence.start(id, req.actor); }
  @Post('outreach/leads/:id/stop') async stop(@Param('id') id: string, @Req() req: any) { return { cancelled: await this.sequence.stop(id, 'operator', req.actor) }; }
  @Post('outreach/ingest/poll') pollNow() { return this.ingest.poll(); }

  @Get('inbox') inbox(@Query('handled') handled?: string, @Query('intent') intent?: ReplyIntent) { return this.ingest.inbox({ handled: handled === undefined ? undefined : handled === 'true', intent }); }
  @Post('inbox/:id/reply') reply(@Param('id') id: string, @Body() body: { body: string }, @Req() req: any) { return this.send.sendHumanReply(id, body.body, req.actor); }
  @Post('inbox/:id/handled') handled(@Param('id') id: string) { return this.prisma.reply.update({ where: { id }, data: { handled: true } }); }
  @Post('inbox/:id/reclassify') reclassify(@Param('id') id: string, @Body() body: { intent: ReplyIntent }, @Req() req: any) { return this.ingest.reclassify(id, body.intent, req.actor); }
  @Post('inbox/:id/suppress') async suppressFromInbox(@Param('id') id: string, @Body() body: { note?: string }, @Req() req: any) { return this.ingest.reclassify(id, 'not_interested', req.actor).then(() => ({ ok: true, note: body?.note })); }
}
