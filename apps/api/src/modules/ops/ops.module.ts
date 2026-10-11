import { Global, Module } from '@nestjs/common';
import { CostLedgerService } from './cost-ledger.service';
import { QuotaService } from './quota.service';
import { AlertService } from './alert.service';
import { KillSwitchService } from './kill-switch.service';
import { HealthService } from './health.service';
import { HealthController, OpsController } from './ops.controller';

@Global()
@Module({
  providers: [CostLedgerService, QuotaService, AlertService, KillSwitchService, HealthService],
  controllers: [HealthController, OpsController],
  exports: [CostLedgerService, QuotaService, AlertService, KillSwitchService],
})
export class OpsModule {}
