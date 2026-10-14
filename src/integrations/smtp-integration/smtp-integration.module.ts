import { Module } from '@nestjs/common';
import { SmtpTransportService } from './smtp-transport.service';

@Module({
  providers: [SmtpTransportService],
  exports: [SmtpTransportService],
})
export class SmtpIntegrationModule {}
