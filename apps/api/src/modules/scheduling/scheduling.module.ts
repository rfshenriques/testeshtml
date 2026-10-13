import { Module } from '@nestjs/common';
import { OutreachModule } from '../outreach/outreach.module';
import { SchedulingService } from './scheduling.service';
import { BookingPublicController, MockupBookingController, SchedulingAdminController } from './scheduling.controller';

/**
 * Bookable calls with the operator + simulated bookings on mockups. Registered before PreviewModule in
 * AppModule so `/p/:slug/book` is matched ahead of the preview catch-all route.
 */
@Module({
  imports: [OutreachModule],
  providers: [SchedulingService],
  controllers: [MockupBookingController, BookingPublicController, SchedulingAdminController],
  exports: [SchedulingService],
})
export class SchedulingModule {}
