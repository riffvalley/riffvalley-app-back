import { Module } from '@nestjs/common';
import { SmtpIntegrationModule } from 'src/integrations/smtp-integration/smtp-integration.module';
import { MailService } from './mail.service';
import { MailSenderService } from './senders/mail-sender.service';

@Module({
  imports: [SmtpIntegrationModule],
  providers: [MailService, MailSenderService],
  exports: [MailService],
})
export class MailModule {}
