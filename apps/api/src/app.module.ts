import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DomainErrorFilter } from './shared/errors/domain-error.filter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './shared/config/config.module';
import { LoggingModule } from './shared/logging/logging.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { QueuesModule } from './shared/queues/queues.module';
import { OpsModule } from './modules/ops/ops.module';
import { CrmModule } from './modules/crm/crm.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { TerritoryModule } from './modules/territory/territory.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { QualificationModule } from './modules/qualification/qualification.module';
import { WorkersModule } from './workers/workers.module';
import { LlmModule } from './shared/llm/llm.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { ProfilingModule } from './modules/profiling/profiling.module';
import { ReviewModule } from './modules/review/review.module';
import { GeneratorModule } from './modules/generator/generator.module';
import { PreviewModule } from './modules/preview/preview.module';
import { QuotingModule } from './modules/quoting/quoting.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { CrmAdminModule } from './modules/crm/crm-admin.module';
import { ConversionModule } from './modules/conversion/conversion.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    QueuesModule,
    ScheduleModule.forRoot(),
    OpsModule,
    CrmModule,
    ComplianceModule,
    PipelineModule,
    TerritoryModule,
    DiscoveryModule,
    QualificationModule,
    LlmModule,
    EnrichmentModule,
    ProfilingModule,
    ReviewModule,
    GeneratorModule,
    PreviewModule,
    QuotingModule,
    OutreachModule,
    CrmAdminModule,
    ConversionModule,
    ...(process.env.WORKERS === 'off' ? [] : [WorkersModule]),
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
