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
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
