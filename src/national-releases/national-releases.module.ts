import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NationalRelease } from './entities/national-release.entity';
import { NationalReleasesService } from './national-releases.service';
import { NationalReleasesController } from './national-releases.controller';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([NationalRelease]), AuthModule, MailModule],
  controllers: [NationalReleasesController],
  providers: [NationalReleasesService],
})
export class NationalReleasesModule {}
