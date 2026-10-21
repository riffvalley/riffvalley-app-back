import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { DiscRequest } from './entities/disc-request.entity';
import { Artist } from '../../catalog/artists/entities/artist.entity';
import { Disc } from '../../catalog/discs/entities/disc.entity';
import { Genre } from '../../catalog/genres/entities/genre.entity';
import { Country } from '../../catalog/countries/entities/country.entity';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscRequest, Artist, Disc, Genre, Country]),
    AuthorizationModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
