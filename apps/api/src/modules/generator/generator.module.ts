import { Module } from '@nestjs/common';
import { ProfilingModule } from '../profiling/profiling.module';
import { AstroSiteBuilder } from './site-builder.service';
import { GeneratorService } from './generator.service';
import { SampleService } from './sample.service';
import { GeneratorController } from './generator.controller';

@Module({
  imports: [ProfilingModule],
  providers: [AstroSiteBuilder, GeneratorService, SampleService],
  controllers: [GeneratorController],
  exports: [GeneratorService, AstroSiteBuilder],
})
export class GeneratorModule {}
