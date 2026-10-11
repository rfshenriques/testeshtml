import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { QualificationService } from '../modules/qualification/qualification.service';

@Processor(QUEUES.qualificationProbe.name, { concurrency: QUEUES.qualificationProbe.concurrency, limiter: QUEUES.qualificationProbe.limiter })
export class QualificationProbeWorker extends BaseWorker {
  constructor(private readonly qualification: QualificationService) {
    super();
  }
  process(job: Job<{ leadId: string }>) {
    return this.run(job, () => this.qualification.qualify(job.data.leadId));
  }
}
