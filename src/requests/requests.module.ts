import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { DiscRequest } from './entities/disc-request.entity';
import { Artist } from '../artists/entities/artist.entity';
import { Disc } from '../discs/entities/disc.entity';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscRequest, Artist, Disc, Genre, Country]),
    AuthModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
