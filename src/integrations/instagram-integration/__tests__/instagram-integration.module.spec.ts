import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { InstagramPost } from '../entities/instagram-post.entity';
import { InstagramController } from '../instagram.controller';
import { InstagramIntegrationModule } from '../instagram-integration.module';
import { InstagramService } from '../instagram.service';
import { InstagramTokenStorageService } from '../instagram-token-storage.service';

describe('InstagramIntegrationModule', () => {
  it('registers the controller, providers, and provider cache entity', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      InstagramIntegrationModule,
    ) as { module: unknown }[];
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        InstagramIntegrationModule,
      ),
    ).toEqual([InstagramController]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        InstagramIntegrationModule,
      ),
    ).toEqual([InstagramService, InstagramTokenStorageService]);
    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe(TypeOrmModule);
    const injectedRepositories = Reflect.getMetadata(
      'self:paramtypes',
      InstagramService,
    ) as { index: number; param: string }[];
    expect(injectedRepositories).toEqual(
      expect.arrayContaining([
        { index: 0, param: getRepositoryToken(InstagramPost) },
      ]),
    );
    expect(
      Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        InstagramService.prototype.refreshAccessToken,
      ),
    ).toEqual({ cronTime: '0 4 * * 0', timeZone: 'Europe/Madrid' });
  });

  it('resolves InstagramService with its token storage dependency', async () => {
    const module = await Test.createTestingModule({
      providers: [
        InstagramService,
        InstagramTokenStorageService,
        {
          provide: getRepositoryToken(InstagramPost),
          useValue: { upsert: jest.fn(), findAndCount: jest.fn() },
        },
      ],
    }).compile();

    expect(module.get(InstagramService)).toBeInstanceOf(InstagramService);
    expect(module.get(InstagramTokenStorageService)).toBeInstanceOf(
      InstagramTokenStorageService,
    );
  });
});
