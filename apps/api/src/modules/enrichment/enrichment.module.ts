import { Module } from '@nestjs/common';
import { QualificationModule } from '../qualification/qualification.module';
import { emailVerifierProvider, enrichmentAdaptersProvider } from './enrichment.providers';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentController } from './enrichment.controller';

@Module({
  imports: [QualificationModule],
  providers: [enrichmentAdaptersProvider, emailVerifierProvider, EnrichmentService],
  controllers: [EnrichmentController],
  exports: [EnrichmentService, enrichmentAdaptersProvider, emailVerifierProvider],
})
export class EnrichmentModule {}
