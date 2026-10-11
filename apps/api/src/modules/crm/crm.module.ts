import { Global, Module } from '@nestjs/common';
import { LeadEventsService } from './lead-events.service';

@Global()
@Module({ providers: [LeadEventsService], exports: [LeadEventsService] })
export class CrmModule {}
