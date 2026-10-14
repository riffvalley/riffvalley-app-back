import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CloudflareR2IntegrationModule } from './cloudflare-r2-integration.module';
import { CloudflareR2Service } from './cloudflare-r2.service';

describe('CloudflareR2IntegrationModule', () => {
  it('provides and exports the R2 adapter', () => {
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        CloudflareR2IntegrationModule,
      ),
    ).toEqual([CloudflareR2Service]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        CloudflareR2IntegrationModule,
      ),
    ).toEqual([CloudflareR2Service]);
  });
});
