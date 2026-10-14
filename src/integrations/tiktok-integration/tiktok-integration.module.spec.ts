import { AuthModule } from 'src/auth/auth.module';
import { MailModule } from 'src/communications/mail/mail.module';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { MailService } from 'src/communications/mail/mail.service';
import { TiktokConnection } from './oauth/tiktok-connection.entity';
import { TiktokVideo } from './entities/tiktok-video.entity';
import { TiktokApiService } from './api/tiktok-api.service';
import { TiktokConnectionService } from './oauth/tiktok-connection.service';
import { TiktokIntegrationModule } from './tiktok-integration.module';
import { TiktokController } from './http/tiktok.controller';
import { TiktokService } from './tiktok.service';
import { TiktokTokenCryptoService } from './oauth/token-crypto.service';
import { TiktokVideosService } from './videos/tiktok-videos.service';

describe('TiktokIntegrationModule', () => {
  it('registers provider HTTP, token, persistence and existing app dependencies', () => {
    const imports = Reflect.getMetadata('imports', TiktokIntegrationModule);
    expect(imports).toEqual(expect.arrayContaining([AuthModule, MailModule]));
    const typeOrmFeature = imports.find(
      (module: any) => module?.module === TypeOrmModule,
    );
    expect(typeOrmFeature).toBeDefined();
    expect(
      typeOrmFeature.providers.map((provider: any) => provider.provide),
    ).toEqual(
      expect.arrayContaining([
        getRepositoryToken(TiktokConnection),
        getRepositoryToken(TiktokVideo),
      ]),
    );
    expect(
      Reflect.getMetadata('controllers', TiktokIntegrationModule),
    ).toContain(TiktokController);
    expect(Reflect.getMetadata('providers', TiktokIntegrationModule)).toEqual(
      expect.arrayContaining([
        TiktokService,
        TiktokApiService,
        TiktokConnectionService,
        TiktokVideosService,
        TiktokTokenCryptoService,
      ]),
    );
  });

  it('resolves TiktokService through Nest dependency injection', async () => {
    const module = await Test.createTestingModule({
      providers: [
        TiktokService,
        { provide: getRepositoryToken(TiktokConnection), useValue: {} },
        { provide: getRepositoryToken(TiktokVideo), useValue: {} },
        { provide: ConfigService, useValue: {} },
        TiktokApiService,
        TiktokConnectionService,
        TiktokVideosService,
        { provide: TiktokTokenCryptoService, useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    expect(module.get(TiktokService)).toBeInstanceOf(TiktokService);
    expect(module.get(TiktokApiService)).toBeInstanceOf(TiktokApiService);
    expect(module.get(TiktokConnectionService)).toBeInstanceOf(
      TiktokConnectionService,
    );
    expect(module.get(TiktokVideosService)).toBeInstanceOf(TiktokVideosService);
    await module.close();
  });

  it('retains both scheduled job expressions and the authorization time zone', () => {
    expect(
      Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        TiktokConnectionService.prototype.checkAuthorizationLifetime,
      ),
    ).toMatchObject({
      cronTime: '0 9 * * *',
      timeZone: 'Europe/Madrid',
    });
    expect(
      Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        TiktokService.prototype.syncVideos,
      ).cronTime,
    ).toBe(process.env.TIKTOK_SYNC_CRON || '*/10 * * * *');
    expect(
      Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        TiktokService.prototype.checkAuthorizationLifetime,
      ),
    ).toBeUndefined();
  });
});
