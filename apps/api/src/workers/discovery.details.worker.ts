import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { DetailsService } from '../modules/discovery/details.service';

@Processor(QUEUES.discoveryDetails.name, { concurrency: QUEUES.discoveryDetails.concurrency, limiter: QUEUES.discoveryDetails.limiter })
export class DiscoveryDetailsWorker extends BaseWorker {
  constructor(private readonly details: DetailsService) {
    super();
  }
  process(job: Job<{ leadId: string }>) {
    return this.run(job, async () => {
      const d = await this.details.fetch(job.data.leadId);
      return { fetched: !!d };
    });
  }
}
