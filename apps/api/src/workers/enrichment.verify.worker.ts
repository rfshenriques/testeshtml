import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { EnrichmentService } from '../modules/enrichment/enrichment.service';

@Processor(QUEUES.enrichmentVerify.name, { concurrency: QUEUES.enrichmentVerify.concurrency })
export class EnrichmentVerifyWorker extends BaseWorker {
  constructor(private readonly enrichment: EnrichmentService) {
    super();
  }
  process(job: Job<{ leadId: string; contactId: string }>) {
    return this.run(job, async () => {
      const r = await this.enrichment.verifyContact(job.data.contactId);
      await this.enrichment.choosePrimary(job.data.leadId);
      return r;
    });
  }
}
