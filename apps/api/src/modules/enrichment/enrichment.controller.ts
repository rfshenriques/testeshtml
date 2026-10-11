import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { EnrichmentService } from './enrichment.service';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class EnrichmentController {
  constructor(private readonly enrichment: EnrichmentService) {}

  @Get('enrichment/report')
  report(@Query('campaignId') campaignId?: string) {
    return this.enrichment.report(campaignId);
  }

  @Post('leads/:id/contacts')
  addContact(@Param('id') id: string, @Body() body: { email: string; source: string; sourceUrl?: string; emailType?: 'named' | 'role_generic' }, @Req() req: any) {
    return this.enrichment.addManualContact(id, body, req.actor);
  }

  @Post('leads/:id/contacts/:contactId/primary')
  setPrimary(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.enrichment.setPrimary(id, contactId);
  }
}
