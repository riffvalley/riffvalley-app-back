import { Module } from '@nestjs/common';
import { CatalogImportService } from './import/manual/import/catalog-import.service';
import { CatalogImportController } from './import/manual/controller/catalog-import.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from 'src/artists/entities/artist.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { Country } from 'src/countries/entities/country.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ManualImportLogger } from './import/manual/logging/manual-import-logger';
import { ExcelController } from './import/excel/controller/excel.controller';
import { ExcelImportService } from './import/excel/import/excel-import.service';
import { ExcelTemplateService } from './import/excel/template/excel-template.service';
import { ExcelWorkbookParser } from './import/excel/parser/excel-workbook.parser';

@Module({
  imports: [
    TypeOrmModule.forFeature([Artist, Disc, Country, Genre]),
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
