import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { AdminTokenGuard } from '../../shared/auth/admin-token.guard';
import { HealthService } from './health.service';
import { KillSwitchService } from './kill-switch.service';
import { CostLedgerService } from './cost-ledger.service';
import { QuotaService } from './quota.service';
import { AlertService } from './alert.service';
import { ReadinessService } from './readiness.service';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { QUEUES, QueueKey } from '@sitewright/shared-types';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get('health')
  check() {
    return this.health.check();
  }
}

@Controller('admin/ops')
@UseGuards(AdminTokenGuard)
export class OpsController {
  constructor(
    private readonly killSwitch: KillSwitchService,
    private readonly costs: CostLedgerService,
    private readonly quotas: QuotaService,
    private readonly alerts: AlertService,
    private readonly queues: QueueRegistry,
    private readonly readiness: ReadinessService,
  ) {}

  /** Go-live checklist: keys, providers, identity, sending domains (live DNS), mailboxes, demo data. */
  @Get('readiness') readinessCheck() { return this.readiness.check(); }
  @Post('purge-demo') purgeDemo() { return this.readiness.purgeDemo(); }

  @Get('overview')
  async overview() {
    const since30d = new Date(Date.now() - 30 * 86400_000);
    const [killSwitch, depths, byCategory, byCampaign, quotas, alerts, economics] = await Promise.all([
      this.killSwitch.isEngaged(),
      this.queues.depths(),
      this.costs.totalsByCategory(undefined, since30d),
      this.costs.totalsByCampaign(since30d),
      this.quotas.all(),
      this.alerts.list(true, 50),
      this.costs.unitEconomics(),
    ]);
    return { killSwitch, queues: depths, costs: { byCategory, byCampaign }, quotas, alerts, economics };
  }

  @Post('kill-switch')
  async setKillSwitch(@Body() body: { engaged: boolean; reason?: string }, @Req() req: any) {
    if (body.engaged) await this.killSwitch.engage(body.reason ?? 'operator action', req.actor);
    else await this.killSwitch.release(req.actor);
    return { engaged: await this.killSwitch.isEngaged() };
  }

  @Post('queues/:key/pause')
  async pause(@Param('key') key: QueueKey) {
    if (!QUEUES[key]) return { error: 'unknown queue' };
    await this.queues.get(key).pause();
    return { paused: true };
  }

  @Post('queues/:key/resume')
  async resume(@Param('key') key: QueueKey) {
    if (!QUEUES[key]) return { error: 'unknown queue' };
    if (await this.killSwitch.isEngaged()) return { error: 'kill switch engaged; release it first' };
    await this.queues.get(key).resume();
    return { paused: false };
  }

  @Get('costs')
  costsFor(@Query('campaignId') campaignId?: string) {
    return Promise.all([this.costs.totalsByCategory(campaignId), this.costs.unitEconomics(campaignId)]).then(
      ([byCategory, economics]) => ({ byCategory, economics }),
    );
  }

  @Get('alerts')
  listAlerts(@Query('all') all?: string) {
    return this.alerts.list(all !== '1');
  }

  @Post('alerts/:id/ack')
  ack(@Param('id') id: string) {
    return this.alerts.acknowledge(id);
  }
}
