import { Test } from '@nestjs/testing';
import { MailService } from 'src/communications/mail/mail.service';
import { MailModule } from 'src/communications/mail/mail.module';
import { SmtpIntegrationModule } from './smtp-integration.module';
import { SmtpTransportService } from './smtp-transport.service';

describe('SmtpIntegrationModule', () => {
  it('exports its transport and resolves it through MailModule', async () => {
    const module = await Test.createTestingModule({
      imports: [SmtpIntegrationModule, MailModule],
    }).compile();

    expect(module.get(SmtpTransportService)).toBeInstanceOf(
      SmtpTransportService,
    );
    expect(module.get(MailService)).toBeInstanceOf(MailService);
    await module.close();
  });
});
