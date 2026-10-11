import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { ENV, Env } from '../config/config.module';
import { QueueRegistry } from './queue-registry.service';

/**
 * Registers every queue from the shared registry with its concurrency and rate limiter (spec §2.3).
 * Workers (one file per queue) live in src/workers and declare concurrency on the processor.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => {
        const url = new URL(env.REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
            maxRetriesPerRequest: null,
          },
          prefix: env.NODE_ENV === 'test' ? `sw-test-${process.pid}` : 'sw',
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        };
      },
    }),
    // Rate limiters are Worker options in BullMQ 5; each processor in src/workers passes QUEUES[key].limiter.
    ...Object.values(QUEUES).map((q) => BullModule.registerQueue({ name: q.name })),
  ],
  providers: [QueueRegistry],
  exports: [BullModule, QueueRegistry],
})
export class QueuesModule {}
