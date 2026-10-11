import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { SendService } from '../modules/outreach/send.service';

/** Serialised: concurrency 1 keeps per-mailbox ordering and spacing (spec §2.3). */
@Processor(QUEUES.outreachSend.name, { concurrency: QUEUES.outreachSend.concurrency })
export class OutreachSendWorker extends BaseWorker {
  constructor(private readonly send: SendService) {
    super();
  }
  process(job: Job<{ messageId: string; leadId: string }>) {
    return this.run(job, () => this.send.dispatch(job.data.messageId));
  }
}
