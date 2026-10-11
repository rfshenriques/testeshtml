import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../../shared/redis/redis.module';
import { QuotaExceededError } from '../../shared/errors/errors';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Hard daily quota guards per external API (spec §14): enforced atomically in Redis so that
 * concurrent workers cannot exceed the cap, mirrored to Postgres for the ops dashboard.
 */
@Injectable()
export class QuotaService {
  constructor(@Inject(REDIS) private readonly redis: Redis, private readonly prisma: PrismaService) {}

  static dayKey(d = new Date()): string {
    return d.toISOString().slice(0, 10);
  }

  private key(api: string, day = QuotaService.dayKey()) {
    return `quota:${api}:${day}`;
  }

  /** Reserve `units` against the daily cap. Throws QuotaExceededError (and rolls back) if the cap would be exceeded. */
  async consume(api: string, cap: number, units = 1): Promise<number> {
    const key = this.key(api);
    const used = await this.redis.incrby(key, units);
    if (used === units) await this.redis.expire(key, 60 * 60 * 36);
    if (used > cap) {
      await this.redis.decrby(key, units);
      throw new QuotaExceededError(`daily cap for ${api} reached (${cap})`, { api, cap, used: used - units });
    }
    const day = QuotaService.dayKey();
    this.prisma.apiQuota
      .upsert({ where: { id: `${api}:${day}` }, create: { id: `${api}:${day}`, api, day, used, cap }, update: { used, cap } })
      .catch(() => undefined);
    return used;
  }

  async usage(api: string): Promise<number> {
    return Number((await this.redis.get(this.key(api))) ?? 0);
  }

  async all(): Promise<{ api: string; day: string; used: number; cap: number }[]> {
    return this.prisma.apiQuota.findMany({ where: { day: QuotaService.dayKey() }, orderBy: { api: 'asc' } });
  }
}
