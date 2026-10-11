import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { EnrichmentService } from '../modules/enrichment/enrichment.service';

@Processor(QUEUES.enrichmentEmail.name, { concurrency: QUEUES.enrichmentEmail.concurrency })
export class EnrichmentEmailWorker extends BaseWorker {
  constructor(private readonly enrichment: EnrichmentService) {
    super();
  }
  process(job: Job<{ leadId: string }>) {
    return this.run(job, () => this.enrichment.enrich(job.data.leadId));
  }
}
