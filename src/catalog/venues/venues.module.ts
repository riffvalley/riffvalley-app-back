import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrativeRegionsModule } from '../administrative-regions/administrative-regions.module';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { GeocodingRateLimit } from './entities/geocoding-rate-limit.entity';
import { Locality } from './entities/locality.entity';
import { LocalityAlias } from './entities/locality-alias.entity';
import { Venue } from './entities/venue.entity';
import { LocalitiesController } from './localities/localities.controller';
import { LocalitiesService } from './localities/localities.service';
import { NominatimGeocoderService } from './localities/nominatim-geocoder.service';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Locality,
      LocalityAlias,
      Venue,
      GeocodingRateLimit,
    ]),
    AdministrativeRegionsModule,
    AuthorizationModule,
    ConfigModule,
  ],
  controllers: [VenuesController, LocalitiesController],
  providers: [VenuesService, LocalitiesService, NominatimGeocoderService],
  exports: [VenuesService],
})
export class VenuesModule {}
