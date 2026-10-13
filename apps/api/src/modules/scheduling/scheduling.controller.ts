import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { resolvePalette, type Brand, type ColourSchemeId, type TemplateFamily } from '@sitewright/shared-types';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { LinkTokenService } from '../compliance/link-token.service';
import { expiredPage } from '../preview/preview.controller';
import { BookingError, SchedulingService, type BookingRequest } from './scheduling.service';
import { bookingPage, managePage, simplePage } from './booking.page';
import { formatInZone } from './availability';

const NOINDEX = 'noindex, nofollow, noarchive';

function sendError(res: Response, e: unknown, wantsHtml: boolean) {
  const status = e instanceof BookingError ? e.status : 500;
  const message = e instanceof BookingError ? e.message : 'Something went wrong';
  if (wantsHtml) return res.status(status).type('html').send(simplePage('Booking problem', message));
  return res.status(status).json({ ok: false, status, message });
}

/** Booking flow on a concept mockup: `/p/:slug/book` (registered ahead of the preview catch-all). */
@Controller('p/:slug/book')
export class MockupBookingController {
  constructor(private readonly scheduling: SchedulingService, private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {}

  private async site(slug: string) {
    const site = await this.prisma.generatedSite.findUnique({ where: { previewSlug: slug }, include: { lead: { select: { id: true, businessName: true, countryCode: true, stage: true } } } });
    if (!site || !site.publishedAt || site.lead.stage === 'suppressed') return { status: 404 as const };
    if (site.takenDownAt || site.expiresAt <= new Date()) return { status: 410 as const };
    return { status: 200 as const, site };
  }

  @Get()
  @Header('x-robots-tag', NOINDEX)
  async page(@Param('slug') slug: string, @Res() res: Response) {
    const r = await this.site(slug);
    if (r.status === 404) return res.status(404).type('html').send(simplePage('Not found', 'There is no preview at this address.'));
    if (r.status === 410) return res.status(410).type('html').send(expiredPage(this.env.AGENCY_NAME, this.env.AGENCY_URL));
    const { site } = r;
    const palette = resolvePalette(site.templateId as TemplateFamily, site.colourScheme as ColourSchemeId, (site.brand as unknown as Brand | null) ? toBrandInput(site.brand as unknown as Brand) : null);
    const s = await this.scheduling.siteSlots(site.id, new Date(), 1);
    return res.type('html').send(bookingPage({
      host: site.lead.businessName, title: `Book with ${site.lead.businessName}`, durationMinutes: s.slotMinutes, base: `${this.env.APP_BASE_URL}/p/${slug}/book`,
      context: 'Choose a time and leave your details; no phone call needed.',
      points: ['Pick any free slot during opening hours', 'Instant confirmation on screen', 'Add it to your own calendar'],
      mockup: { agencyName: this.env.AGENCY_NAME, agencyUrl: this.env.AGENCY_URL, businessName: site.lead.businessName, palette },
      hoursNote: s.hoursKnown ? 'Free times follow the opening hours on the Google listing.' : 'Opening hours were not listed, so weekday office hours are shown for the demonstration.',
      source: 'mockup',
    }));
  }

  @Get('slots')
  @Header('x-robots-tag', NOINDEX)
  async slots(@Param('slug') slug: string, @Res() res: Response) {
    const r = await this.site(slug);
    if (r.status !== 200) return res.status(r.status).json({ ok: false });
    const s = await this.scheduling.siteSlots(r.site.id, new Date(), 14);
    return res.json({ timezone: s.timezone, slotMinutes: s.slotMinutes, horizonDays: 14, hoursKnown: s.hoursKnown, slots: s.slots.map((d) => d.toISOString()) });
  }

  @Post()
  @HttpCode(200)
  @Header('x-robots-tag', NOINDEX)
  async book(@Param('slug') slug: string, @Body() body: BookingRequest, @Req() req: Request, @Res() res: Response) {
    const wantsHtml = !(req.headers.accept ?? '').includes('application/json');
    const r = await this.site(slug);
    if (r.status !== 200) return res.status(r.status).json({ ok: false });
    try {
      const m = await this.scheduling.book({ leadId: r.site.lead.id, siteId: r.site.id, kind: 'mockup_demo' }, { ...body, source: 'mockup' });
      const icsUrl = `${this.scheduling.manageUrl(m)}/ics`;
      if (wantsHtml) return res.type('html').send(simplePage('Booked (demonstration)', `Your appointment with ${r.site.lead.businessName} for ${formatInZone(m.startAt, m.timezone)} was recorded on this mockup. Nothing was sent to the business.`, { href: icsUrl, label: 'Add to calendar' }));
      return res.json({ ok: true, meetingId: m.id, startAt: m.startAt.toISOString(), icsUrl });
    } catch (e) {
      return sendError(res, e, wantsHtml);
    }
  }
}

function toBrandInput(b: Brand) {
  return { primary: b.primary, accent: b.accent, heroBg: b.heroBg };
}

/** Calls with the operator: signed per-lead booking links from outreach emails and the proposal page; meeting management links from emails. */
@Controller()
export class BookingPublicController {
  constructor(private readonly scheduling: SchedulingService, private readonly prisma: PrismaService, private readonly links: LinkTokenService, @Inject(ENV) private readonly env: Env) {}

  private async leadFor(token: string) {
    const payload = this.links.verify(token, 'book');
    if (!payload) return null;
    const lead = await this.prisma.lead.findUnique({ where: { id: payload.leadId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } });
    if (!lead || lead.stage === 'suppressed') return null;
    return lead;
  }

  @Get('book/:token')
  @Header('x-robots-tag', NOINDEX)
  async page(@Param('token') token: string, @Query('src') src: string | undefined, @Query('reschedule') reschedule: string | undefined, @Res() res: Response) {
    const lead = await this.leadFor(token);
    if (!lead) return res.status(404).type('html').send(simplePage('Link not valid', 'This booking link is no longer valid.'));
    const a = await this.scheduling.availability();
    return res.type('html').send(bookingPage({
      host: this.env.AGENCY_NAME, title: a.meetingTitle, durationMinutes: a.slotMinutes, base: `${this.env.APP_BASE_URL}/book/${token}`,
      context: `About the concept website for ${lead.businessName}.`,
      points: ['We walk through the mockup together and note what you would change', 'Straight answers on cost, timing and what happens next', 'No obligation; cancel or move it with one click'],
      email: lead.contacts[0]?.email ?? null, source: src === 'proposal' ? 'proposal' : 'outreach', rescheduleOf: reschedule ?? null,
    }));
  }

  @Get('book/:token/slots')
  @Header('x-robots-tag', NOINDEX)
  async slots(@Param('token') token: string, @Res() res: Response) {
    const lead = await this.leadFor(token);
    if (!lead) return res.status(404).json({ ok: false });
    const s = await this.scheduling.agencySlots(new Date(), 14);
    return res.json({ timezone: s.availability.timezone, slotMinutes: s.availability.slotMinutes, horizonDays: s.availability.horizonDays, slots: s.slots.map((d) => d.toISOString()) });
  }

  @Post('book/:token')
  @HttpCode(200)
  @Header('x-robots-tag', NOINDEX)
  async book(@Param('token') token: string, @Body() body: BookingRequest & { rescheduleOf?: string | null }, @Req() req: Request, @Res() res: Response) {
    const wantsHtml = !(req.headers.accept ?? '').includes('application/json');
    const lead = await this.leadFor(token);
    if (!lead) return res.status(404).json({ ok: false, message: 'This booking link is no longer valid.' });
    try {
      const m = await this.scheduling.book({ leadId: lead.id, siteId: null, kind: 'agency_call' }, { ...body, source: body.source === 'proposal' ? 'proposal' : 'outreach' });
      if (body.rescheduleOf) {
        const old = await this.prisma.meeting.findFirst({ where: { id: body.rescheduleOf, leadId: lead.id, status: { in: ['scheduled', 'confirmed'] } } });
        if (old) await this.scheduling.cancel(old.id, 'rescheduled', 'public');
      }
      const manageUrl = this.scheduling.manageUrl(m);
      if (wantsHtml) return res.redirect(302, manageUrl);
      return res.json({ ok: true, meetingId: m.id, startAt: m.startAt.toISOString(), manageUrl, icsUrl: `${manageUrl}/ics` });
    } catch (e) {
      return sendError(res, e, wantsHtml);
    }
  }

  private async meetingFor(token: string) {
    const payload = this.links.verify(token, 'meeting');
    if (!payload?.meetingId) return null;
    return this.prisma.meeting.findUnique({ where: { id: payload.meetingId }, include: { lead: { select: { id: true, businessName: true } } } });
  }

  @Get('m/:token')
  @Header('x-robots-tag', NOINDEX)
  async manage(@Param('token') token: string, @Query('confirm') confirm: string | undefined, @Res() res: Response) {
    let m = await this.meetingFor(token);
    if (!m) return res.status(404).type('html').send(simplePage('Link not valid', 'This link is no longer valid.'));
    let justConfirmed = false;
    if (confirm === '1' && m.status === 'scheduled') {
      await this.scheduling.confirm(m.id);
      m = (await this.meetingFor(token))!;
      justConfirmed = true;
    }
    const a = await this.scheduling.availability();
    const isMockup = m.kind === 'mockup_demo';
    return res.type('html').send(managePage({
      host: isMockup ? (m.lead?.businessName ?? 'the business') : this.env.AGENCY_NAME,
      title: isMockup ? `Appointment with ${m.lead?.businessName ?? 'the business'} (mockup)` : a.meetingTitle,
      whenText: formatInZone(m.startAt, m.timezone), status: m.status, base: `${this.env.APP_BASE_URL}/m/${token}`,
      bookAgainUrl: !isMockup && m.leadId ? `${this.scheduling.bookingUrl(m.leadId)}${m.status === 'cancelled' ? '' : `?reschedule=${m.id}`}` : null,
      justConfirmed,
    }));
  }

  @Post('m/:token/confirm')
  @Header('x-robots-tag', NOINDEX)
  async confirm(@Param('token') token: string, @Res() res: Response) {
    const m = await this.meetingFor(token);
    if (!m) return res.status(404).type('html').send(simplePage('Link not valid', 'This link is no longer valid.'));
    try { await this.scheduling.confirm(m.id); } catch (e) { return sendError(res, e, true); }
    return res.redirect(302, `${this.env.APP_BASE_URL}/m/${token}?confirm=1`);
  }

  @Post('m/:token/cancel')
  @Header('x-robots-tag', NOINDEX)
  async cancel(@Param('token') token: string, @Body() body: { reason?: string }, @Res() res: Response) {
    const m = await this.meetingFor(token);
    if (!m) return res.status(404).type('html').send(simplePage('Link not valid', 'This link is no longer valid.'));
    await this.scheduling.cancel(m.id, body?.reason?.trim() || 'cancelled by attendee', 'public');
    return res.redirect(302, `${this.env.APP_BASE_URL}/m/${token}`);
  }

  @Get('m/:token/ics')
  @Header('x-robots-tag', NOINDEX)
  async ics(@Param('token') token: string, @Res() res: Response) {
    const m = await this.meetingFor(token);
    if (!m) return res.status(404).type('text').send('not found');
    const a = await this.scheduling.availability();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${m.kind === 'mockup_demo' ? 'appointment' : 'call'}.ics"`);
    return res.send(this.scheduling.icsFor(m, { cancelled: m.status === 'cancelled', organizerEmail: a.notifyEmail, businessName: m.lead?.businessName ?? null }));
  }
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class SchedulingAdminController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('scheduling/availability') availability() { return this.scheduling.availability(); }
  @Put('scheduling/availability')
  async setAvailability(@Body() body: { availability: unknown }, @Req() req: any) {
    try {
      return await this.scheduling.setAvailability(body?.availability ?? body, req.actor);
    } catch (e) {
      if (e instanceof ZodError) throw new BadRequestException({ error: 'VALIDATION', message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      if (e instanceof BookingError) throw new BadRequestException({ error: 'VALIDATION', message: e.message });
      throw e;
    }
  }
  @Get('scheduling/slots')
  async slots(@Query('days') days?: string) {
    const s = await this.scheduling.agencySlots(new Date(), Math.min(60, Number(days) || 14));
    return { timezone: s.availability.timezone, slots: s.slots.map((d) => d.toISOString()) };
  }
  @Get('meetings') list(@Query('upcoming') upcoming?: string, @Query('leadId') leadId?: string) { return this.scheduling.list({ upcoming: upcoming === '1' || upcoming === 'true', leadId }); }
  @Post('meetings/:id/cancel') cancel(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req: any) { return this.scheduling.cancel(id, body?.reason ?? 'cancelled by operator', req.actor); }
  @Post('meetings/:id/complete') complete(@Param('id') id: string, @Req() req: any) { return this.scheduling.setOutcome(id, 'completed', req.actor); }
  @Post('meetings/:id/no-show') noShow(@Param('id') id: string, @Req() req: any) { return this.scheduling.setOutcome(id, 'no_show', req.actor); }
  @Post('meetings/:id/resend')
  async resend(@Param('id') id: string) {
    await this.scheduling.resendConfirmation(id);
    return { ok: true };
  }
}
