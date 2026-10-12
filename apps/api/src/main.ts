import 'reflect-metadata';
import { loadDotenv } from './shared/config/load-dotenv';
loadDotenv();
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express, { json, urlencoded } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { ENV, Env } from './shared/config/config.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  // Previews, photos and proposals are embedded cross-origin (separate preview domain, sandboxed thumbnails): allow it.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' }, crossOriginEmbedderPolicy: false }));
  app.use(cookieParser());
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true }));
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();
  serveAdminConsole(app);
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  app.get(Logger).log(`Sitewright API listening on :${env.PORT} (${env.NODE_ENV})`);
}
/**
 * Serve the built operator console (apps/admin/dist) from the API when ADMIN_DIST (or the default
 * monorepo path) exists, with an SPA fallback for everything that is not an API or public route.
 */
function serveAdminConsole(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const dir = process.env.ADMIN_DIST || path.resolve(__dirname, '../../admin/dist');
  if (!fs.existsSync(path.join(dir, 'index.html'))) return;
  const reserved = /^\/(admin|p|q|u|t|takedown|webhooks|health|robots\.txt)(\/|$)/;
  const server = app.getHttpAdapter().getInstance();
  server.use(express.static(dir, { index: false, maxAge: '1h' }));
  server.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET' || reserved.test(req.path) || req.path.includes('.')) return next();
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(dir, 'index.html'));
  });
}

bootstrap();
