import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { ProfilingService } from '../modules/profiling/profiling.service';

@Processor(QUEUES.profilingClassify.name, { concurrency: QUEUES.profilingClassify.concurrency, limiter: QUEUES.profilingClassify.limiter })
export class ProfilingClassifyWorker extends BaseWorker {
  constructor(private readonly profiling: ProfilingService) {
    super();
  }
  process(job: Job<{ leadId: string }>) {
    return this.run(job, () => this.profiling.classify(job.data.leadId));
  }
}
