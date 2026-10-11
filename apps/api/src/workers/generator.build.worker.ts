import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { GeneratorService } from '../modules/generator/generator.service';

@Processor(QUEUES.generatorBuild.name, { concurrency: QUEUES.generatorBuild.concurrency })
export class GeneratorBuildWorker extends BaseWorker {
  constructor(private readonly generator: GeneratorService) {
    super();
  }
  process(job: Job<{ leadId: string; templateId?: any; colourScheme?: any; typography?: any; regenerateCopy?: boolean; reason?: string }>) {
    return this.run(job, async () => {
      const { leadId, ...opts } = job.data;
      const r = await this.generator.generate(leadId, opts);
      return r.skipped ? { skipped: true, reason: r.reason } : { buildHash: r.site.buildHash, violations: r.violations.length };
    });
  }
}
