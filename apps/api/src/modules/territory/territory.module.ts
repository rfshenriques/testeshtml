import { Module } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { TilerService } from './tiler.service';
import { TerritoryController } from './territory.controller';

@Module({
  providers: [CampaignService, TilerService],
  controllers: [TerritoryController],
  exports: [CampaignService, TilerService],
})
export class TerritoryModule {}
