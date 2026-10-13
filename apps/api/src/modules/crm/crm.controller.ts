import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { LeadAction, LeadsService } from './leads.service';
import { DashboardService } from './dashboard.service';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class CrmController {
  constructor(private readonly leads: LeadsService, private readonly dashboard: DashboardService) {}

  @Get('dashboard') overview() { return this.dashboard.overview(); }

  @Get('leads')
  list(@Query() q: Record<string, string>) {
    const bool = (v: string | undefined) => (v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : undefined);
    return this.leads.list({ ...q, minScore: q.minScore ? Number(q.minScore) : undefined, take: q.take ? Number(q.take) : undefined, hasEmail: bool(q.hasEmail), hasPhone: bool(q.hasPhone), minPhotos: q.minPhotos ? Number(q.minPhotos) : undefined } as any);
  }
  /** Prospect counts per country by tier (email + photos / photos only / no photos). */
  @Get('leads/prospects') prospects() { return this.leads.prospects(); }
  @Get('leads/:id') detail(@Param('id') id: string) { return this.leads.detail(id); }
  @Patch('leads/:id') patch(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.leads.patch(id, body, req.actor); }
  @Post('leads/bulk') bulk(@Body() body: { ids: string[]; action: LeadAction; payload?: Record<string, any> }, @Req() req: any) { return this.leads.bulk(body.ids ?? [], body.action, body.payload ?? {}, req.actor); }
  @Post('leads/:id/actions/:action')
  async action(@Param('id') id: string, @Param('action') action: LeadAction, @Body() body: Record<string, any>, @Req() req: any) {
    const r = await this.leads.action(id, action, body ?? {}, req.actor);
    return { ok: r.ok, enqueued: r.ok ? 1 : 0, results: [r] };
  }
  @Post('leads/:id/tasks') addTask(@Param('id') id: string, @Body() body: { title: string; dueAt?: string }) { return this.leads.addTask(id, body.title, body.dueAt); }
  @Post('tasks/:id/done') done(@Param('id') id: string) { return this.leads.completeTask(id); }
  @Get('tasks') tasks(@Query('open') open?: string) { return this.leads.tasks(open === '1' || open === 'true'); }
}
