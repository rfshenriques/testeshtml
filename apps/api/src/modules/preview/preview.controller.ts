import { All, Body, Controller, Get, Header, HttpCode, Next, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PreviewService } from './preview.service';
import { PREVIEW_HEADERS } from './storage';
import { LinkTokenService } from '../compliance/link-token.service';
import { ENV, Env } from '../../shared/config/config.module';
import { Inject } from '@nestjs/common';
import { page } from '../compliance/compliance.controller';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { PipelineService } from '../pipeline/pipeline.service';

@Controller()
export class PreviewPublicController {
  constructor(private readonly preview: PreviewService, private readonly links: LinkTokenService, @Inject(ENV) private readonly env: Env) {}

  /** robots.txt on the preview host: blanket disallow (spec §0.6, §9.5). Also served on the app host; harmless. */
  @Get('robots.txt')
  @Header('content-type', 'text/plain; charset=utf-8')
  @Header('x-robots-tag', PREVIEW_HEADERS['X-Robots-Tag'])
  robots() {
    return 'User-agent: *\nDisallow: /\n';
  }

  @Post('p/:slug/form')
  @HttpCode(200)
  async form(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Res() res: Response) {
    const r = await this.preview.submitForm(slug, body ?? {});
    res.setHeader('X-Robots-Tag', PREVIEW_HEADERS['X-Robots-Tag']);
    if (!r) return res.status(404).json({ ok: false });
    const wantsHtml = (res.req.headers.accept ?? '').includes('text/html') || res.req.headers['content-type']?.includes('form-urlencoded');
    if (wantsHtml) return res.status(200).type('html').send(page('Thanks — this is a mockup', 'Your message was recorded for demonstration only. This concept site is not yet live, so nothing was sent to the business.'));
    return res.json(r);
  }

  @All('p/:slug')
  async root(@Param('slug') slug: string, @Req() req: Request, @Res() res: Response) {
    return this.send(slug, '', req, res);
  }

  @All('p/:slug/*path')
  async file(@Param('slug') slug: string, @Param('path') p: string[] | string, @Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    const rel = Array.isArray(p) ? p.join('/') : p;
    // `/p/:slug/book…` belongs to the scheduling module (mockup booking flow); let the later route handle it.
    if (rel === 'book' || rel.startsWith('book/')) return next();
    return this.send(slug, rel, req, res);
  }

  private async send(slug: string, filePath: string, req: Request, res: Response) {
    res.setHeader('X-Robots-Tag', PREVIEW_HEADERS['X-Robots-Tag']);
    res.setHeader('Cache-Control', PREVIEW_HEADERS['Cache-Control']);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const r = await this.preview.serve(slug, filePath, { ip, ua: String(req.headers['user-agent'] ?? '') });
    if (r.status === 404) return res.status(404).type('html').send(page('Not found', 'There is no preview at this address.'));
    if (r.status === 410) return res.status(410).type('html').send(expiredPage(this.env.AGENCY_NAME, this.env.AGENCY_URL));
    res.setHeader('Content-Type', r.contentType);
    return res.status(200).send(req.method === 'HEAD' ? undefined : r.body);
  }

  /** One-click "delete the mockup you made" (spec §1.2 item 5, §9.5). Unauthenticated, signed token. */
  @Get('takedown/:token')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('x-robots-tag', PREVIEW_HEADERS['X-Robots-Tag'])
  async takedown(@Param('token') token: string) {
    const payload = this.links.verify(token, 'takedown');
    if (!payload) return page('This link is not valid.', 'If you want a mockup removed, reply to our email and we will delete it immediately.');
    await this.preview.takedown(payload.leadId, 'takedown_request', 'recipient');
    return page('The mockup has been deleted.', 'We have permanently removed the concept site and will not contact you again.');
  }
}

export function expiredPage(agencyName: string, agencyUrl: string) {
  return page('This mockup has expired.', `This concept mockup, prepared by ${agencyName} (${agencyUrl}), is no longer available.`);
}

@Controller('admin/preview')
@UseGuards(AdminTokenGuard)
export class PreviewAdminController {
  constructor(private readonly preview: PreviewService, private readonly pipeline: PipelineService) {}

  @Post('leads/:id/publish')
  async publish(@Param('id') id: string) {
    await this.pipeline.enqueue('previewPublish', 'publish', id, {}, { force: true });
    return { ok: true, enqueued: 1 };
  }

  @Post('leads/:id/takedown')
  takedown(@Param('id') id: string, @Req() req: any) {
    return this.preview.takedown(id, 'operator', req.actor);
  }
}
