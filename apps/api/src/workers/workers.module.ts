import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../modules/discovery/discovery.module';
import { QualificationModule } from '../modules/qualification/qualification.module';
import { DiscoveryTileWorker } from './discovery.tile.worker';
import { DiscoveryDetailsWorker } from './discovery.details.worker';
import { QualificationProbeWorker } from './qualification.probe.worker';

/** One processor per queue (spec §2.2 workers/). Imported by AppModule unless WORKERS=off. */
@Module({
  imports: [DiscoveryModule, QualificationModule],
  providers: [DiscoveryTileWorker, DiscoveryDetailsWorker, QualificationProbeWorker],
})
export class WorkersModule {}
