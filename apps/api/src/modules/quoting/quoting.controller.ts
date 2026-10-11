import { Body, Controller, Get, Header, Inject, NotFoundException, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { QuotingService } from './quoting.service';
import { renderProposal } from './proposal.page';
import { ENV, Env } from '../../shared/config/config.module';
import { TierName } from '@sitewright/shared-types';

@Controller('q')
export class QuotePublicController {
  constructor(private readonly quoting: QuotingService, @Inject(ENV) private readonly env: Env) {}

  @Get(':slug')
  async page(@Param('slug') slug: string, @Res() res: Response) {
    const r = await this.quoting.proposalHtml(slug);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(r.status).type('html').send(r.html);
  }

  @Post(':slug/accept')
  async accept(@Param('slug') slug: string, @Body() body: { tier?: string }, @Res() res: Response) {
    const r = await this.quoting.accept(slug, body?.tier);
    if ('error' in r) return res.status(r.status).type('html').send(renderProposal.notFound());
    return res.redirect(303, r.url);
  }

  @Get(':slug/thanks')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('x-robots-tag', 'noindex, nofollow, noarchive')
  thanks() {
    return renderProposal.thanks(this.env.AGENCY_NAME);
  }

  @Get(':slug/decline')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('x-robots-tag', 'noindex, nofollow, noarchive')
  async decline(@Param('slug') slug: string) {
    const ok = await this.quoting.decline(slug);
    return ok ? renderProposal.declined() : renderProposal.notFound();
  }
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class PricingAdminController {
  constructor(private readonly quoting: QuotingService) {}

  @Get('pricing')
  config() {
    return this.quoting.config();
  }

  @Put('pricing')
  update(@Body() body: { config: unknown }, @Req() req: any) {
    return this.quoting.updateConfig(body.config, req.actor);
  }

  @Post('pricing/preview')
  preview(@Body() body: { leadId: string; tier?: TierName; addOns?: string[] }) {
    return this.quoting.compute(body.leadId, { tier: body.tier, addOns: body.addOns });
  }

  @Get('leads/:id/quote')
  async get(@Param('id') id: string) {
    const q = await this.quoting.getForLead(id);
    if (!q) throw new NotFoundException('no quote');
    return q;
  }

  @Post('leads/:id/quote')
  create(@Param('id') id: string, @Body() body: { tier?: TierName; addOns?: string[] }, @Req() req: any) {
    return this.quoting.createQuote(id, { tier: body?.tier, addOns: body?.addOns, actor: req.actor });
  }
}
