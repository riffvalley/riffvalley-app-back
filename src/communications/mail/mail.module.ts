import { Module } from '@nestjs/common';
import { SmtpIntegrationModule } from 'src/integrations/smtp-integration/smtp-integration.module';
import { MailService } from './mail.service';

@Module({
  imports: [SmtpIntegrationModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
