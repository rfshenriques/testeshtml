import { Body, Controller, Get, Header, NotFoundException, Param, Post, Put, Query, Req, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { GeneratorService } from './generator.service';
import { SampleService } from './sample.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PipelineService } from '../pipeline/pipeline.service';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class GeneratorController {
  constructor(private readonly generator: GeneratorService, private readonly samples: SampleService, private readonly prisma: PrismaService, private readonly pipeline: PipelineService) {}

  @Get('generator/templates')
  templates() {
    return this.generator.templates();
  }

  @Get('generator/templates/:id/sample')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('x-robots-tag', 'noindex, nofollow, noarchive')
  async sample(@Param('id') id: string, @Query('colourScheme') cs = 'a', @Query('typography') ty = 'a') {
    return this.samples.sampleHtml(id, cs, ty);
  }

  @Get('generator/builds')
  builds(@Query('take') take?: string) {
    return this.generator.recentBuilds(take ? Number(take) : 50);
  }

  @Get('leads/:id/site')
  async site(@Param('id') id: string) {
    const site = await this.prisma.generatedSite.findUnique({ where: { leadId: id } });
    if (!site) throw new NotFoundException('no generated site');
    return site;
  }

  @Get('leads/:id/site/variants')
  variants(@Param('id') id: string) {
    return this.generator.variants(id).catch((e) => { throw new UnprocessableEntityException({ error: 'NOT_READY', message: (e as Error).message }); });
  }

  @Get('leads/:id/site/variant')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('x-robots-tag', 'noindex, nofollow, noarchive')
  variant(@Param('id') id: string, @Query('template') template: any, @Query('colourScheme') colourScheme: any = 'a', @Query('typography') typography: any = 'a') {
    return this.generator.variantHtml(id, template, colourScheme, typography).catch((e) => { throw new UnprocessableEntityException({ error: 'NOT_READY', message: (e as Error).message }); });
  }

  @Put('leads/:id/site/copy')
  updateCopy(@Param('id') id: string, @Body() body: { copy: unknown }, @Req() req: any) {
    return this.generator.updateCopy(id, body.copy, req.actor);
  }

  @Post('leads/:id/site/rebuild')
  async rebuild(@Param('id') id: string, @Body() body: { templateId?: any; colourScheme?: any; typography?: any; regenerateCopy?: boolean }) {
    await this.pipeline.enqueue('generatorBuild', 'build', id, { ...body, reason: 'operator rebuild' }, { force: true });
    return { ok: true, enqueued: 1 };
  }

  /** Serve the local build output of a lead's site for the operator (before/without publishing). */
  @Get('leads/:id/site/files/*path')
  async file(@Param('id') id: string, @Param('path') p: string[] | string) {
    const site = await this.prisma.generatedSite.findUnique({ where: { leadId: id } });
    if (!site?.buildPath) throw new NotFoundException();
    const rel = Array.isArray(p) ? p.join('/') : p || 'index.html';
    const full = path.resolve(site.buildPath, rel.endsWith('/') || !rel ? `${rel}index.html` : rel);
    if (!full.startsWith(path.resolve(site.buildPath))) throw new NotFoundException();
    return fs.readFile(full, 'utf8').catch(() => { throw new NotFoundException(); });
  }
}
