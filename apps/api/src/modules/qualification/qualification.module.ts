import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../discovery/discovery.module';
import { WebsiteProbeService } from './website-probe.service';
import { QualificationService } from './qualification.service';

@Module({
  imports: [DiscoveryModule],
  providers: [WebsiteProbeService, QualificationService],
  exports: [WebsiteProbeService, QualificationService],
})
export class QualificationModule {}
