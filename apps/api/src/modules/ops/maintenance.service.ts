import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QUEUES } from '@sitewright/shared-types';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { RetentionService } from '../compliance/retention.service';
import { PreviewService } from '../preview/preview.service';

/** Nightly maintenance (spec §2.3 maintenance.purge, cron 03:00): snapshot expiry, retention, preview expiry. */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly log = new Logger(MaintenanceService.name);
  constructor(private readonly queues: QueueRegistry, private readonly retention: RetentionService, private readonly preview: PreviewService) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const q = this.queues.get('maintenancePurge');
    await q.upsertJobScheduler('nightly', { pattern: '0 3 * * *' }, { name: QUEUES.maintenancePurge.name, data: {} }).catch((e) => this.log.warn(`scheduler: ${e}`));
  }

  async nightly() {
    const retention = await this.retention.runAll();
    const expiredPreviews = await this.preview.expireSites();
    this.log.log({ ...retention, expiredPreviews }, 'nightly maintenance done');
    return { ...retention, expiredPreviews };
  }
}
