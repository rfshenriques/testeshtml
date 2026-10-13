import { Global, Module } from '@nestjs/common';
import { CostLedgerService } from './cost-ledger.service';
import { QuotaService } from './quota.service';
import { AlertService } from './alert.service';
import { KillSwitchService } from './kill-switch.service';
import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';
import { HealthController, OpsController } from './ops.controller';
import { MaintenanceService } from './maintenance.service';
import { PreviewModule } from '../preview/preview.module';

@Global()
@Module({
  imports: [PreviewModule],
  providers: [CostLedgerService, QuotaService, AlertService, KillSwitchService, HealthService, MaintenanceService, ReadinessService],
  controllers: [HealthController, OpsController],
  exports: [CostLedgerService, QuotaService, AlertService, KillSwitchService, MaintenanceService],
})
export class OpsModule {}
