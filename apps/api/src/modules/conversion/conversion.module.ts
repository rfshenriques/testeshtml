import { Module } from '@nestjs/common';
import { QuotingModule } from '../quoting/quoting.module';
import { OutreachModule } from '../outreach/outreach.module';
import { ConversionService } from './conversion.service';
import { BillingService } from '../billing/billing.service';
import { ConversionAdminController, StripeWebhookController } from './conversion.controller';

@Module({ imports: [QuotingModule, OutreachModule], providers: [ConversionService, BillingService], controllers: [StripeWebhookController, ConversionAdminController], exports: [ConversionService, BillingService] })
export class ConversionModule {}
