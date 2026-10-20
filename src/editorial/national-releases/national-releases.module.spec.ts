import { MODULE_METADATA } from '@nestjs/common/constants';
import { MailService } from '../../communications/mail/mail.service';
import { MailModule } from '../../communications/mail/mail.module';
import { NationalReleasesModule } from './national-releases.module';
import { NationalReleasesService } from './national-releases.service';

describe('NationalReleasesModule mail composition', () => {
  it('imports MailModule and does not register MailService a second time', () => {
    const imports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      NationalReleasesModule,
    );
    const providers: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      NationalReleasesModule,
    );
    const mailProviders: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MailModule,
    );
    const mailExports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MailModule,
    );

    expect(imports).toContain(MailModule);
    expect(providers).toContain(NationalReleasesService);
    expect(providers).not.toContain(MailService);
    expect(mailProviders).toContain(MailService);
    expect(mailExports).toContain(MailService);
  });
});
