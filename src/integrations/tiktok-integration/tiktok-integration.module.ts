import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { MailModule } from 'src/communications/mail/mail.module';
import { TiktokConnection } from './oauth/tiktok-connection.entity';
import { TiktokVideo } from './entities/tiktok-video.entity';
import { TiktokController } from './http/tiktok.controller';
import { TiktokApiService } from './api/tiktok-api.service';
import { TiktokConnectionService } from './oauth/tiktok-connection.service';
import { TiktokService } from './tiktok.service';
import { TiktokVideosService } from './videos/tiktok-videos.service';
import { TiktokTokenCryptoService } from './oauth/token-crypto.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TiktokConnection, TiktokVideo]),
    AuthorizationModule,
    MailModule,
  ],
  controllers: [TiktokController],
  providers: [
    TiktokService,
    TiktokApiService,
    TiktokConnectionService,
    TiktokVideosService,
    TiktokTokenCryptoService,
  ],
})
export class TiktokIntegrationModule {}
