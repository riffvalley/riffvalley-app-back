import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { User } from 'src/identity/auth/entities/user.entity';
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
      [AuthorizationModule, CloudflareR2IntegrationModule],
    );
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        CloudflareR2IntegrationModule,
      ),
    ).toContain(CloudflareR2Service);
  });

  it('resolves UploadsController and UploadsService through Authorization and R2 providers', async () => {
    let moduleRef: TestingModule;
    const builder = Test.createTestingModule({ imports: [UploadsModule] })
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({ get: () => 'uploads-module-test-secret' })
      .overrideProvider(CloudflareR2Service)
      .useValue({ uploadObject: jest.fn() });

    moduleRef = await builder.compile();

    expect(moduleRef.get(UploadsController)).toBeDefined();
    expect(moduleRef.get(UploadsService)).toBeDefined();
    await moduleRef.close();
  });
});
