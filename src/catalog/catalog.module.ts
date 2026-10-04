import { Module } from '@nestjs/common';
import { CatalogImportService } from './import/manual/import/catalog-import.service';
import { CatalogImportController } from './import/manual/controller/catalog-import.controller';
import { ArtistsModule } from './artists/artists.module';
import { GenresModule } from './genres/genres.module';
import { CountriesModule } from './countries/countries.module';
import { DiscModule } from './discs/discs.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Disc } from './discs/entities/disc.entity';
import { Country } from './countries/entities/country.entity';
import { Genre } from './genres/entities/genre.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ManualImportLogger } from './import/manual/logging/manual-import-logger';
import { ExcelController } from './import/excel/controller/excel.controller';
import { ExcelImportService } from './import/excel/import/excel-import.service';
import { ExcelTemplateService } from './import/excel/template/excel-template.service';
import { ExcelWorkbookParser } from './import/excel/parser/excel-workbook.parser';

@Module({
  imports: [
    TypeOrmModule.forFeature([Artist, Disc, Country, Genre]),
    ArtistsModule,
    GenresModule,
    CountriesModule,
    DiscModule,
    AuthModule,
  ], // Ensure the Disc entity is registered
  controllers: [CatalogImportController, ExcelController],
  providers: [
    CatalogImportService,
    ManualImportLogger,
    ExcelImportService,
    ExcelTemplateService,
    ExcelWorkbookParser,
  ],
})
export class CatalogModule {}
