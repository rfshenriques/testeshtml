import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { QueueRegistry } from '../src/shared/queues/queue-registry.service';
import { resetDb } from './db';
import Redis from 'ioredis';
import { REDIS } from '../src/shared/redis/redis.module';
import { JURISDICTIONS } from '@sitewright/db';
import { DEFAULT_PRICING, DEFAULT_SEQUENCE } from '@sitewright/db';

export const AUTH = { authorization: 'Bearer test-admin-token' };

export async function createTestApp(overrides?: (b: ReturnType<typeof Test.createTestingModule>) => ReturnType<typeof Test.createTestingModule>) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrides) builder = overrides(builder);
  const mod = await builder.compile();
  const app = mod.createNestApplication({ logger: false, rawBody: true });
  await app.init();
  const prisma = app.get(PrismaService);
  await resetDb(prisma);
  await resetRedis(app.get<Redis>(REDIS));
  await seedBasics(prisma);
  return app;
}

/** Delete application keys (probe budgets, quotas, places cache, kill switch) so runs do not pollute each other. */
export async function resetRedis(redis: Redis) {
  for (const pattern of ['probe:*', 'quota:*', 'places:*', 'ops:*', 'send:*', 'mailbox:*', 'view:*']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }
}

export async function seedBasics(prisma: PrismaService) {
  for (const j of JURISDICTIONS) await prisma.jurisdictionPolicy.upsert({ where: { countryCode: j.countryCode }, create: j, update: j });
  await prisma.pricingConfig.upsert({ where: { id: 'default' }, create: { id: 'default', config: DEFAULT_PRICING as object }, update: {} });
  await prisma.sequenceConfig.upsert({ where: { id: 'default' }, create: { id: 'default', steps: DEFAULT_SEQUENCE as object }, update: {} });
}

export async function closeTestApp(app: INestApplication) {
  await app.get(QueueRegistry).obliterateAll();
  await app.close();
}

/** A campaign + place + lead with a valid, sourced primary contact in Malta: passes the gate by default. */
export async function makeLead(prisma: PrismaService, overrides: Partial<{ countryCode: string; businessName: string; reviewCount: number; email: string; verification: 'unverified' | 'valid' | 'risky' | 'invalid' | 'catchall'; source: string | null; placeId: string; websiteStatus: any }> = {}) {
  const countryCode = overrides.countryCode ?? 'MT';
  const campaign = await prisma.campaign.upsert({
    where: { id: `camp-${countryCode}` },
    create: { id: `camp-${countryCode}`, name: `Test ${countryCode}`, countryCode, geometry: { kind: 'bbox', bbox: [14.4, 35.85, 14.6, 35.95] }, includedTypes: ['dentist'], excludedTypes: [], budgetUsdCap: 100, status: 'running' },
    update: {},
  });
  const placeId = overrides.placeId ?? `place-${Math.random().toString(36).slice(2, 10)}`;
  await prisma.placeRef.upsert({ where: { placeId }, create: { placeId, countryCode }, update: {} });
  const lead = await prisma.lead.create({
    data: {
      campaignId: campaign.id, placeId, businessName: overrides.businessName ?? 'Valletta Dental Clinic Ltd', countryCode,
      city: 'Valletta', reviewCount: overrides.reviewCount ?? 60, rating: 4.6, websiteStatus: overrides.websiteStatus ?? 'none', stage: 'enriched', primaryType: 'dentist', score: 0.8,
      contacts: {
        create: {
          email: overrides.email ?? `info@${placeId.replace(/[^a-z0-9]/gi, '')}-dental.com`, emailType: 'role_generic', source: overrides.source === undefined ? 'registry:mbr' : (overrides.source as string),
          sourceUrl: 'https://registry.mbr.mt/x', confidence: 0.9, verification: overrides.verification ?? 'valid', verifiedAt: new Date(), isPrimary: true,
        },
      },
    },
    include: { contacts: true },
  });
  return lead;
}
