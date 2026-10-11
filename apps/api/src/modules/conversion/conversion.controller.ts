import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { ConversionService } from './conversion.service';
import { BillingService } from '../billing/billing.service';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly conversion: ConversionService) {}
  /** Raw body + signature verification (spec §12.1). */
  @Post('stripe')
  async stripe(@Req() req: Request, @Headers('stripe-signature') signature?: string) {
    const raw: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const r = await this.conversion.handleStripeWebhook(raw, signature);
    if (!r.ok) throw new NotFoundException('invalid signature');
    return r;
  }
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class ConversionAdminController {
  constructor(private readonly conversion: ConversionService, private readonly billing: BillingService) {}

  @Get('conversion/provisioning') list() { return this.conversion.list(); }
  @Get('conversion/provisioning/:leadId') async get(@Param('leadId') leadId: string) { const p = await this.conversion.get(leadId); if (!p) throw new NotFoundException(); return p; }
  @Post('conversion/provisioning/:leadId/items/:key') setItem(@Param('leadId') leadId: string, @Param('key') key: string, @Body() body: { done: boolean; note?: string }, @Req() req: any) { return this.conversion.setItem(leadId, key, !!body.done, body.note, req.actor); }
  @Put('conversion/provisioning/:leadId/onboarding') onboarding(@Param('leadId') leadId: string, @Body() body: { form: Record<string, unknown> }, @Req() req: any) { return this.conversion.setOnboarding(leadId, body.form ?? {}, req.actor); }
  /** Manual acceptance (bank transfer, signed offline). */
  @Post('conversion/quotes/:quoteId/accept') acceptManually(@Param('quoteId') quoteId: string, @Body() body: { tier?: string }, @Req() req: any) { return this.conversion.accept(quoteId, { tier: body?.tier, actor: req.actor }); }

  @Get('billing/subscriptions') subs() { return this.billing.list(); }
  @Get('billing/subscriptions/:id') sub(@Param('id') id: string) { return this.billing.get(id); }
  @Get('billing/subscriptions/:id/sla') async sla(@Param('id') id: string) { const s = await this.billing.get(id); return { sla: s.sla, usage: s.usage, slaOverdue: s.slaOverdue }; }
  @Post('billing/subscriptions/:id/update-requests') addReq(@Param('id') id: string, @Body() body: { description: string }, @Req() req: any) { return this.billing.addUpdateRequest(id, body.description, req.actor); }
  @Post('billing/update-requests/:id/complete') complete(@Param('id') id: string) { return this.billing.completeUpdateRequest(id); }
}
