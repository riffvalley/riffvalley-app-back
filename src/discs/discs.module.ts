import { Module } from '@nestjs/common';
import { DiscsService } from './discs.service';
import { DiscsController } from './discs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from './entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';
import { NationalRelease } from '../national-releases/entities/national-release.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [DiscsController],
  providers: [DiscsService],
  imports: [TypeOrmModule.forFeature([Disc, Artist, NationalRelease]), AuthModule],
  exports: [DiscsService],
})
export class DiscModule {}
