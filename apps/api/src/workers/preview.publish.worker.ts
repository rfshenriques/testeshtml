import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { PreviewService } from '../modules/preview/preview.service';

@Processor(QUEUES.previewPublish.name, { concurrency: QUEUES.previewPublish.concurrency })
export class PreviewPublishWorker extends BaseWorker {
  constructor(private readonly preview: PreviewService) {
    super();
  }
  process(job: Job<{ leadId: string }>) {
    return this.run(job, () => this.preview.publish(job.data.leadId));
  }
}
