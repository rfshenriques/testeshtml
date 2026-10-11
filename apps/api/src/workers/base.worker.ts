import { Logger } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

/** Common job wrapper: structured log line per job with leadId/correlation, errors re-thrown for BullMQ retries. */
export abstract class BaseWorker extends WorkerHost {
  protected readonly log = new Logger(this.constructor.name);

  protected async run<T>(job: Job, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    const ctx = { queue: job.queueName, job: job.name, jobId: job.id, leadId: job.data?.leadId, tileId: job.data?.tileId, attempt: job.attemptsMade + 1 };
    try {
      const result = await fn();
      this.log.log({ ...ctx, ms: Date.now() - started }, 'job done');
      return result;
    } catch (e) {
      this.log.error({ ...ctx, ms: Date.now() - started, err: (e as Error).message }, 'job failed');
      throw e;
    }
  }
}
