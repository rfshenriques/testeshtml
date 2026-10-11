import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { lookup } from 'node:dns/promises';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { REDIS } from '../../shared/redis/redis.module';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { KillSwitchService } from './kill-switch.service';

const EXTERNAL_HOSTS = ['places.googleapis.com', 'api.anthropic.com', 'api.stripe.com', 'api.company-information.service.gov.uk'];

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly queues: QueueRegistry,
    private readonly killSwitch: KillSwitchService,
  ) {}

  async check() {
    const [db, redis, queues, external, killSwitch] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch((e) => `error: ${e.message}`),
      this.redis.ping().then((r) => (r === 'PONG' ? 'ok' : `unexpected: ${r}`)).catch((e) => `error: ${e.message}`),
      this.queues.depths().catch((e) => `error: ${e.message}`),
      Promise.all(
        EXTERNAL_HOSTS.map(async (host) => {
          const t = Date.now();
          const ok = await Promise.race([
            lookup(host).then(() => true).catch(() => false),
            new Promise<boolean>((r) => setTimeout(() => r(false), 1500)),
          ]);
          return { host, reachable: ok, ms: Date.now() - t };
        }),
      ),
      this.killSwitch.isEngaged(),
    ]);
    const healthy = db === 'ok' && redis === 'ok';
    return { status: healthy ? 'ok' : 'degraded', killSwitch, db, redis, queues, external, time: new Date().toISOString() };
  }
}
