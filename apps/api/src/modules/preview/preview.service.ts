import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Prisma } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';
import { LeadEventsService } from '../crm/lead-events.service';
import { SuppressionService } from '../compliance/suppression.service';
import { AuditService } from '../compliance/audit.service';
import { AlertService } from '../ops/alert.service';
import { contentTypeFor, LocalStorage, ObjectStorage, S3Storage } from './storage';
import { listFiles } from '../generator/site-builder.service';

export const STORAGE = Symbol('STORAGE');
export const storageProvider = {
  provide: STORAGE,
  inject: [ENV],
  useFactory: (env: Env): ObjectStorage =>
    env.STORAGE_DRIVER === 's3'
      ? new S3Storage({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, bucket: env.S3_BUCKET_PREVIEWS, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, forcePathStyle: env.S3_URL_STYLE === 'path' })
      : new LocalStorage(env.LOCAL_STORAGE_DIR),
};

export type ServeResult = { status: 200; body: Buffer; contentType: string } | { status: 404 } | { status: 410 };

/** Hooks other modules register (quoting after publish, outreach on preview view) without circular imports. */
export interface PreviewHooks {
  onPublished?: (leadId: string) => Promise<void>;
  onViewed?: (leadId: string, firstView: boolean) => Promise<void>;
}

/**
 * Preview hosting (spec §9.5–9.6): upload under previews/{slug}/, noindex headers on every
 * response, robots.txt disallow, 410 after expiry, hard-delete takedown + suppression,
 * server-side view tracking deduped by IP+UA hash within 30 minutes.
 */
@Injectable()
export class PreviewService {
  private readonly log = new Logger(PreviewService.name);
  readonly hooks: PreviewHooks = {};
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    private readonly leadEvents: LeadEventsService,
    private readonly suppression: SuppressionService,
    private readonly audit: AuditService,
    private readonly alerts: AlertService,
  ) {}

  previewUrl(slug: string) {
    return `${this.env.PREVIEW_HOST.replace(/\/$/, '')}/${slug}`;
  }

  async publish(leadId: string) {
    const site = await this.prisma.generatedSite.findUniqueOrThrow({ where: { leadId }, include: { lead: true } });
    if (site.lead.stage === 'suppressed') throw new Error('lead is suppressed; refusing to publish');
    if (!site.buildPath) throw new Error('site has no build output');
    const files = await listFiles(site.buildPath);
    if (!files.includes('index.html')) throw new Error('build output has no index.html');
    const index = await fs.readFile(path.join(site.buildPath, 'index.html'), 'utf8');
    assertMockupInvariants(index, this.env.AGENCY_NAME);
    const prefix = `previews/${site.previewSlug}/`;
    for (const f of files) {
      await this.storage.put(prefix + f.split(path.sep).join('/'), await fs.readFile(path.join(site.buildPath, f)), contentTypeFor(f));
    }
    const previewUrl = this.previewUrl(site.previewSlug);
    await this.prisma.generatedSite.update({ where: { id: site.id }, data: { objectPrefix: prefix, previewUrl, publishedAt: new Date(), takenDownAt: null } });
    await this.leadEvents.emit(leadId, 'preview.published', { previewUrl, files: files.length, buildHash: site.buildHash });
    this.log.log({ leadId, previewUrl, files: files.length }, 'preview published');
    if (this.hooks.onPublished) await this.hooks.onPublished(leadId);
    return { previewUrl, files: files.length };
  }

  /** Resolve a public request. Never serves a taken-down or expired site (410) and never leaks whether a slug exists beyond 404. */
  async serve(slug: string, filePath: string, visitor?: { ip: string; ua: string }): Promise<ServeResult> {
    const site = await this.prisma.generatedSite.findUnique({ where: { previewSlug: slug }, select: { id: true, leadId: true, objectPrefix: true, expiresAt: true, takenDownAt: true, publishedAt: true } });
    if (!site || !site.objectPrefix) return { status: 404 };
    if (site.takenDownAt || site.expiresAt <= new Date()) return { status: 410 };
    let rel = filePath.replace(/^\/+/, '');
    // Listing photos are reachable as soon as they are stored (the operator previews styles before publishing); pages only once published.
    if (!site.publishedAt && !rel.startsWith('photos/')) return { status: 404 };
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const obj = (await this.storage.get(site.objectPrefix + rel)) ?? (!path.extname(rel) ? await this.storage.get(`${site.objectPrefix}${rel}/index.html`) : null);
    if (!obj) return { status: 404 };
    if (obj.contentType.startsWith('text/html') && visitor) await this.trackView(site.id, site.leadId, visitor).catch((e) => this.log.warn(`view tracking failed: ${e}`));
    return { status: 200, body: obj.body, contentType: obj.contentType };
  }

  /** Dedupe by sha256(ip+ua) within 30 min (spec §9.6). A view is the strongest buying signal: priority up, operator notified, outreach hook. */
  async trackView(siteId: string, leadId: string, visitor: { ip: string; ua: string }) {
    const hash = createHash('sha256').update(`${visitor.ip}|${visitor.ua}`).digest('hex');
    const fresh = await this.redis.set(`view:${siteId}:${hash}`, '1', 'EX', 1800, 'NX');
    if (fresh !== 'OK') return;
    const site = await this.prisma.generatedSite.update({ where: { id: siteId }, data: { views: { increment: 1 }, lastViewedAt: new Date(), previewViews: { create: { visitorHash: hash } } }, select: { views: true, lead: { select: { businessName: true } } } });
    const firstView = site.views === 1;
    await this.prisma.lead.update({ where: { id: leadId }, data: { priority: { increment: firstView ? 10 : 2 }, lastTouchAt: new Date() } });
    await this.leadEvents.emit(leadId, 'preview.viewed', { views: site.views, firstView });
    if (firstView) await this.alerts.raise('preview_viewed', 'info', `${site.lead.businessName} opened their preview`, { leadId });
    if (this.hooks.onViewed) await this.hooks.onViewed(leadId, firstView);
  }

  /** Hard-delete objects, mark taken down, suppress the business (spec §9.5). Idempotent. */
  async takedown(leadId: string, reason: 'takedown_request' | 'hostile_reply' | 'unsubscribe' | 'operator' | 'objection' | 'expired', actor = 'system') {
    const site = await this.prisma.generatedSite.findUnique({ where: { leadId } });
    if (site) {
      if (site.objectPrefix) await this.storage.deletePrefix(site.objectPrefix).catch((e) => this.log.warn(`delete objects failed: ${e}`));
      if (site.buildPath) await fs.rm(site.buildPath, { recursive: true, force: true }).catch(() => undefined);
      await this.prisma.generatedSite.update({ where: { id: site.id }, data: { takenDownAt: site.takenDownAt ?? new Date(), buildPath: null, previewUrl: reason === 'expired' ? site.previewUrl : null } });
      await this.leadEvents.emit(leadId, 'preview.taken_down', { reason, actor });
      await this.audit.log('preview.taken_down', { reason, slug: site.previewSlug }, { actor, leadId });
    }
    if (reason !== 'expired' && reason !== 'operator') {
      await this.suppression.suppressLead(leadId, reason === 'takedown_request' ? 'takedown_request' : reason, { actor }).catch((e) => this.log.warn(`suppress after takedown failed: ${e}`));
    }
    return { takenDown: !!site };
  }

  /** Nightly: delete objects of expired sites (the serving layer already returns 410). */
  async expireSites(now = new Date()): Promise<number> {
    const expired = await this.prisma.generatedSite.findMany({ where: { expiresAt: { lte: now }, objectPrefix: { not: null }, takenDownAt: null }, select: { leadId: true } });
    for (const s of expired) await this.takedown(s.leadId, 'expired');
    return expired.length;
  }

  async submitForm(slug: string, payload: Record<string, unknown>) {
    const site = await this.prisma.generatedSite.findUnique({ where: { previewSlug: slug }, include: { lead: { select: { id: true, stage: true } } } });
    if (!site || site.takenDownAt) return null;
    const safe = Object.fromEntries(Object.entries(payload).slice(0, 20).map(([k, v]) => [k.slice(0, 40), String(v ?? '').slice(0, 2000)]));
    await this.prisma.formSubmission.create({ data: { siteId: site.id, payload: safe as Prisma.InputJsonValue, forwarded: false } });
    await this.leadEvents.emit(site.lead.id, 'preview.form_submitted', { fields: Object.keys(safe) });
    // Forwarding to the business happens only after conversion (spec §9.2); before that it is captured for demonstration.
    return { ok: true, mockup: site.lead.stage !== 'won' };
  }
}

/** Never publish a preview without the noindex meta and the mockup banner (spec §20 item 7). */
export function assertMockupInvariants(indexHtml: string, agencyName: string) {
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(indexHtml)) throw new Error('refusing to publish: index.html lacks <meta name="robots" content="noindex,nofollow">');
  if (!/concept mockup/i.test(indexHtml) || !indexHtml.includes(agencyName)) throw new Error('refusing to publish: index.html lacks the mockup banner');
  if (/<img(?![^>]*data-placeholder=["']true["'])[^>]*>/i.test(indexHtml)) throw new Error('refusing to publish: an <img> lacks data-placeholder="true"');
}
