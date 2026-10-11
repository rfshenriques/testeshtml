import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../discovery/discovery.module';
import { QuotingModule } from '../quoting/quoting.module';
import { OutreachModule } from '../outreach/outreach.module';
import { LeadsService } from './leads.service';
import { DashboardService } from './dashboard.service';
import { CrmController } from './crm.controller';

/** Leads table, detail drawer, bulk actions, tasks, dashboard (spec §13.1). Separate from the global CrmModule to avoid cycles. */
@Module({ imports: [DiscoveryModule, QuotingModule, OutreachModule], providers: [LeadsService, DashboardService], controllers: [CrmController], exports: [LeadsService] })
export class CrmAdminModule {}
