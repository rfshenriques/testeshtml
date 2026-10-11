import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { DiscoveryService } from '../modules/discovery/discovery.service';

@Processor(QUEUES.discoveryTile.name, { concurrency: QUEUES.discoveryTile.concurrency, limiter: QUEUES.discoveryTile.limiter })
export class DiscoveryTileWorker extends BaseWorker {
  constructor(private readonly discovery: DiscoveryService) {
    super();
  }
  process(job: Job<{ tileId: string }>) {
    return this.run(job, () => this.discovery.processTile(job.data.tileId));
  }
}
