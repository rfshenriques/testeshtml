import { Module } from '@nestjs/common';
import { PreviewModule } from '../preview/preview.module';
import { QuotingModule } from '../quoting/quoting.module';
import { emailProviderProvider, inboundSourceProvider } from './email.providers';
import { MailboxService } from './mailbox.service';
import { SequenceService } from './sequence.service';
import { SendService } from './send.service';
import { IngestService } from './ingest.service';
import { OutreachAdminController, OutreachPublicController } from './outreach.controller';

@Module({
  imports: [PreviewModule, QuotingModule],
  providers: [emailProviderProvider, inboundSourceProvider, MailboxService, SequenceService, SendService, IngestService],
  controllers: [OutreachPublicController, OutreachAdminController],
  exports: [MailboxService, SequenceService, SendService, IngestService, emailProviderProvider, inboundSourceProvider],
})
export class OutreachModule {}
