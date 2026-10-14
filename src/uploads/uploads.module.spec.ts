import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from 'src/auth/auth.module';
import { CloudflareR2IntegrationModule } from 'src/integrations/cloudflare-r2-integration/cloudflare-r2-integration.module';
import { CloudflareR2Service } from 'src/integrations/cloudflare-r2-integration/cloudflare-r2.service';
import { UploadsController } from './uploads.controller';
import { UploadsModule } from './uploads.module';
import { UploadsService } from './uploads.service';

describe('UploadsModule', () => {
  it('imports the R2 integration and exposes only the existing Uploads service contract', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, UploadsModule),
    ).toEqual([UploadsController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UploadsModule),
    ).toEqual([UploadsService]);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, UploadsModule)).toEqual(
      [UploadsService],
    );
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, UploadsModule)).toEqual(
      [AuthModule, CloudflareR2IntegrationModule],
    );
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        CloudflareR2IntegrationModule,
      ),
    ).toContain(CloudflareR2Service);
  });
});
