import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../modules/discovery/discovery.module';
import { QualificationModule } from '../modules/qualification/qualification.module';
import { DiscoveryTileWorker } from './discovery.tile.worker';
import { DiscoveryDetailsWorker } from './discovery.details.worker';
import { QualificationProbeWorker } from './qualification.probe.worker';
import { EnrichmentModule } from '../modules/enrichment/enrichment.module';
import { ProfilingModule } from '../modules/profiling/profiling.module';
import { EnrichmentEmailWorker } from './enrichment.email.worker';
import { EnrichmentVerifyWorker } from './enrichment.verify.worker';
import { ProfilingClassifyWorker } from './profiling.classify.worker';

/** One processor per queue (spec §2.2 workers/). Imported by AppModule unless WORKERS=off. */
@Module({
  imports: [DiscoveryModule, QualificationModule, EnrichmentModule, ProfilingModule],
  providers: [DiscoveryTileWorker, DiscoveryDetailsWorker, QualificationProbeWorker, EnrichmentEmailWorker, EnrichmentVerifyWorker, ProfilingClassifyWorker],
})
export class WorkersModule {}
