import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { CampaignService } from './campaign.service';
import { TilerService } from './tiler.service';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class TerritoryController {
  constructor(private readonly campaigns: CampaignService, private readonly tiler: TilerService) {}

  @Get('place-types')
  placeTypes() {
    return this.campaigns.placeTypeTiers();
  }

  @Get('campaigns')
  list() {
    return this.campaigns.list();
  }

  @Post('campaigns')
  create(@Body() body: unknown, @Req() req: any) {
    return this.campaigns.create(body, req.actor);
  }

  @Get('campaigns/:id')
  detail(@Param('id') id: string) {
    return this.campaigns.detail(id);
  }

  @Patch('campaigns/:id')
  update(@Param('id') id: string, @Body() body: unknown, @Req() req: any) {
    return this.campaigns.update(id, body, req.actor);
  }

  @Post('campaigns/:id/start')
  start(@Param('id') id: string, @Req() req: any) {
    return this.campaigns.start(id, req.actor);
  }

  @Post('campaigns/:id/pause')
  async pause(@Param('id') id: string, @Req() req: any) {
    await this.campaigns.pause(id, req.actor);
    return { status: 'paused' };
  }

  @Post('campaigns/:id/resume')
  resume(@Param('id') id: string, @Req() req: any) {
    return this.campaigns.resume(id, req.actor);
  }

  @Post('campaigns/:id/halt')
  async halt(@Param('id') id: string, @Req() req: any) {
    await this.campaigns.halt(id, req.actor);
    return { status: 'halted' };
  }

  @Get('campaigns/:id/tiles')
  tiles(@Param('id') id: string) {
    return this.tiler.listForMap(id);
  }
}
