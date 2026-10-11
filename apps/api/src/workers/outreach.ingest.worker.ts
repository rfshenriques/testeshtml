import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OnModuleInit } from '@nestjs/common';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { IngestService } from '../modules/outreach/ingest.service';
import { QueueRegistry } from '../shared/queues/queue-registry.service';

/** IMAP poll every 2 minutes (spec §11.7). */
@Processor(QUEUES.outreachIngest.name, { concurrency: QUEUES.outreachIngest.concurrency })
export class OutreachIngestWorker extends BaseWorker implements OnModuleInit {
  constructor(private readonly ingest: IngestService, private readonly queues: QueueRegistry) {
    super();
  }
  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    await this.queues.get('outreachIngest').upsertJobScheduler('imap-poll', { every: 120_000 }, { name: 'poll', data: {} }).catch((e) => this.log.warn(`scheduler: ${e}`));
  }
  process(job: Job) {
    return this.run(job, () => this.ingest.poll());
  }
}
