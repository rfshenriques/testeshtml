import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, QueueKey } from '@sitewright/shared-types';

export interface QueueDepth {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: boolean;
}

@Injectable()
export class QueueRegistry {
  private readonly log = new Logger(QueueRegistry.name);
  constructor(private readonly moduleRef: ModuleRef) {}

  get(key: QueueKey): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(QUEUES[key].name), { strict: false });
  }

  all(): Queue[] {
    return (Object.keys(QUEUES) as QueueKey[]).map((k) => this.get(k));
  }

  async pauseAll(): Promise<void> {
    await Promise.all(this.all().map((q) => q.pause()));
    this.log.warn('All queues paused');
  }

  async resumeAll(): Promise<void> {
    await Promise.all(this.all().map((q) => q.resume()));
    this.log.log('All queues resumed');
  }

  async depths(): Promise<QueueDepth[]> {
    return Promise.all(
      this.all().map(async (q) => {
        const [counts, paused] = await Promise.all([
          q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
          q.isPaused(),
        ]);
        return {
          name: q.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
          paused,
        };
      }),
    );
  }

  /** Drain + obliterate every queue. Test-only helper. */
  async obliterateAll(): Promise<void> {
    await Promise.all(this.all().map((q) => q.obliterate({ force: true }).catch(() => undefined)));
  }
}
