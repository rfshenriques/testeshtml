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
import { GeneratorModule } from '../modules/generator/generator.module';
import { PreviewModule } from '../modules/preview/preview.module';
import { GeneratorBuildWorker } from './generator.build.worker';
import { PreviewPublishWorker } from './preview.publish.worker';
import { MaintenancePurgeWorker } from './maintenance.purge.worker';
import { OutreachModule } from '../modules/outreach/outreach.module';
import { OutreachSendWorker } from './outreach.send.worker';
import { OutreachIngestWorker } from './outreach.ingest.worker';

/** One processor per queue (spec §2.2 workers/). Imported by AppModule unless WORKERS=off. */
@Module({
  imports: [DiscoveryModule, QualificationModule, EnrichmentModule, ProfilingModule, GeneratorModule, PreviewModule, OutreachModule],
  providers: [DiscoveryTileWorker, DiscoveryDetailsWorker, QualificationProbeWorker, EnrichmentEmailWorker, EnrichmentVerifyWorker, ProfilingClassifyWorker, GeneratorBuildWorker, PreviewPublishWorker, MaintenancePurgeWorker, OutreachSendWorker, OutreachIngestWorker],
})
export class WorkersModule {}
