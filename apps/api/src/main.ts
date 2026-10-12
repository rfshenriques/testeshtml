import 'reflect-metadata';
import { loadDotenv } from './shared/config/load-dotenv';
loadDotenv();
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ENV, Env } from './shared/config/config.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true }));
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  app.get(Logger).log(`Sitewright API listening on :${env.PORT} (${env.NODE_ENV})`);
}
bootstrap();
