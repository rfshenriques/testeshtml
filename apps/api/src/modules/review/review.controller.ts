import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ReviewItemStatus, ReviewItemType } from '@sitewright/db';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { ReviewService } from './review.service';

@Controller('admin/review')
@UseGuards(AdminTokenGuard)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get()
  list(@Query('type') type?: ReviewItemType, @Query('status') status?: ReviewItemStatus) {
    return this.review.list({ type, status });
  }

  @Get('counts')
  counts() {
    return this.review.counts();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { edits?: Record<string, unknown> }, @Req() req: any) {
    return this.review.approve(id, body?.edits, req.actor);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: { note?: string }, @Req() req: any) {
    return this.review.reject(id, body?.note, req.actor);
  }
}
