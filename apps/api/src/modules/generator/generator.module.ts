import { Module } from '@nestjs/common';
import { ProfilingModule } from '../profiling/profiling.module';
import { PreviewModule } from '../preview/preview.module';
import { PlacePhotosService } from './place-photos.service';
import { AstroSiteBuilder } from './site-builder.service';
import { GeneratorService } from './generator.service';
import { SampleService } from './sample.service';
import { GeneratorController } from './generator.controller';

@Module({
  imports: [ProfilingModule, PreviewModule],
  providers: [AstroSiteBuilder, GeneratorService, SampleService, PlacePhotosService],
  controllers: [GeneratorController],
  exports: [GeneratorService, AstroSiteBuilder],
})
export class GeneratorModule {}
