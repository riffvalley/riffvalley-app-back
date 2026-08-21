import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { MailModule } from 'src/mail/mail.module';
import { TiktokConnection } from './entities/tiktok-connection.entity';
import { TiktokVideo } from './entities/tiktok-video.entity';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';
import { TiktokTokenCryptoService } from './token-crypto.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TiktokConnection, TiktokVideo]),
    AuthModule,
    MailModule,
  ],
  controllers: [TiktokController],
  providers: [TiktokService, TiktokTokenCryptoService],
})
export class TiktokModule {}
