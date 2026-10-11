import { Module } from '@nestjs/common';
import { PreviewModule } from '../preview/preview.module';
import { StripeService } from './stripe.service';
import { QuotingService } from './quoting.service';
import { PricingAdminController, QuotePublicController } from './quoting.controller';

@Module({
  imports: [PreviewModule],
  providers: [StripeService, QuotingService],
  controllers: [QuotePublicController, PricingAdminController],
  exports: [QuotingService, StripeService],
})
export class QuotingModule {}
