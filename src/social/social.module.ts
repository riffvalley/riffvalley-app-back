import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
