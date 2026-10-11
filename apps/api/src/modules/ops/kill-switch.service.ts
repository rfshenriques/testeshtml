import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { KILL_SWITCH_KEY } from '@sitewright/shared-types';
import { ENV, Env } from '../../shared/config/config.module';
import { REDIS } from '../../shared/redis/redis.module';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { AlertService } from './alert.service';

/**
 * Global kill switch (spec §2.3): pauses every queue and blocks all sends. State lives in Redis so
 * every process sees it; the KILL_SWITCH env var engages it at boot.
 */
@Injectable()
export class KillSwitchService implements OnModuleInit {
  private readonly log = new Logger(KillSwitchService.name);
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly queues: QueueRegistry,
    private readonly alerts: AlertService,
  ) {}

  async onModuleInit() {
    if (this.env.KILL_SWITCH) await this.engage('env KILL_SWITCH=true at boot');
  }

  async isEngaged(): Promise<boolean> {
    return (await this.redis.get(KILL_SWITCH_KEY)) === '1';
  }

  async engage(reason: string, actor = 'system') {
    await this.redis.set(KILL_SWITCH_KEY, '1');
    await this.queues.pauseAll();
    this.log.error({ reason, actor }, 'KILL SWITCH ENGAGED');
    await this.alerts.raise('kill_switch', 'critical', `Kill switch engaged by ${actor}: ${reason}`);
  }

  async release(actor = 'system') {
    await this.redis.del(KILL_SWITCH_KEY);
    await this.queues.resumeAll();
    this.log.warn({ actor }, 'kill switch released');
    await this.alerts.raise('kill_switch', 'info', `Kill switch released by ${actor}`);
  }
}
