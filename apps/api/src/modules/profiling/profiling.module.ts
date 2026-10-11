import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../discovery/discovery.module';
import { ProfilingService } from './profiling.service';

@Module({ imports: [DiscoveryModule], providers: [ProfilingService], exports: [ProfilingService] })
export class ProfilingModule {}
