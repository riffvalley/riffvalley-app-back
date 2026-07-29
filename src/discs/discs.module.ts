import { Module } from '@nestjs/common';
import { DiscsService } from './discs.service';
import { DiscsController } from './discs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from './entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { Country } from 'src/countries/entities/country.entity';
import { AuthModule } from 'src/auth/auth.module';
import { WordpressModule } from 'src/wordpress/wordpress.module';

@Module({
  controllers: [DiscsController],
  providers: [DiscsService],
  imports: [
    TypeOrmModule.forFeature([Disc, Artist, Genre, Country]),
    AuthModule,
    WordpressModule,
  ],
  exports: [DiscsService],
})
export class DiscModule {}
