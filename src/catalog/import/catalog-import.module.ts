import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([Artist, Disc, Country, Genre]),
    AuthModule,
  ],
  controllers: [CatalogImportController, ExcelController],
  providers: [
    CatalogImportService,
    ManualImportLogger,
    ExcelImportService,
    ExcelTemplateService,
    ExcelWorkbookParser,
  ],
})
export class CatalogImportModule {}
