import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Artist } from '../artists/entities/artist.entity';
import { Country } from '../countries/entities/country.entity';
import { Disc } from '../discs/entities/disc.entity';
import { Genre } from '../genres/entities/genre.entity';
import { CatalogImportService } from './manual/import/catalog-import.service';
import { CatalogImportController } from './manual/controller/catalog-import.controller';
import { ManualImportLogger } from './manual/logging/manual-import-logger';
import { ExcelController } from './excel/controller/excel.controller';
import { ExcelImportService } from './excel/import/excel-import.service';
import { ExcelTemplateService } from './excel/template/excel-template.service';
import { ExcelWorkbookParser } from './excel/parser/excel-workbook.parser';
import { ImportEntityResolversService } from './resolution/import-entity-resolvers.service';
import { Tour } from '../tours/entities/tour.entity';
import { Locality } from '../venues/entities/locality.entity';
import { Venue } from '../venues/entities/venue.entity';
import { VenuesService } from '../venues/venues.service';
import { NominatimGeocoderService } from '../venues/localities/nominatim-geocoder.service';
import { Event } from '../events/entities/event.entity';
import { ImportConflictsService } from './conflicts/import-conflicts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Artist,
      Disc,
      Country,
      Genre,
      Tour,
      Locality,
      Venue,
      Event,
    ]),
    AuthorizationModule,
    ConfigModule,
  ],
  controllers: [CatalogImportController, ExcelController],
  providers: [
    CatalogImportService,
    ManualImportLogger,
    ExcelImportService,
    ExcelTemplateService,
    ExcelWorkbookParser,
    ImportEntityResolversService,
    VenuesService,
    NominatimGeocoderService,
    ImportConflictsService,
  ],
  exports: [ImportEntityResolversService, ImportConflictsService],
})
export class CatalogImportModule {}
