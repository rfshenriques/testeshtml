import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { MaintenanceService } from '../modules/ops/maintenance.service';

@Processor(QUEUES.maintenancePurge.name, { concurrency: 1 })
export class MaintenancePurgeWorker extends BaseWorker {
  constructor(private readonly maintenance: MaintenanceService) {
    super();
  }
  process(job: Job) {
    return this.run(job, () => this.maintenance.nightly());
  }
}
