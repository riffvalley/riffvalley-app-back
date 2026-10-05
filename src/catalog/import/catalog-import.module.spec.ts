import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { Artist } from '../artists/entities/artist.entity';
import { Country } from '../countries/entities/country.entity';
import { Disc } from '../discs/entities/disc.entity';
import { Genre } from '../genres/entities/genre.entity';
import { Rate } from '../../community/rates/entities/rate.entity';
import { NationalRelease } from '../../national-releases/entities/national-release.entity';
import { RiffValleyPlaylistArtist } from '../../festival-playlists/entities/riff-valley-playlist-artist.entity';
import { UserAccessLog } from '../../auth/entities/user-access-log.entity';
import { User } from '../../auth/entities/user.entity';
import { SpotifyConnection } from '../../spotify-integration';
import { CatalogImportModule } from './catalog-import.module';
import { CatalogImportController } from './manual/controller/catalog-import.controller';
import { CatalogImportService } from './manual/import/catalog-import.service';
import { ManualImportLogger } from './manual/logging/manual-import-logger';
import { ExcelController } from './excel/controller/excel.controller';
import { ExcelImportService } from './excel/import/excel-import.service';
import { ExcelWorkbookParser } from './excel/parser/excel-workbook.parser';
import { ExcelTemplateService } from './excel/template/excel-template.service';

describe('CatalogImportModule dependency injection', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    jest
      .spyOn(fs, 'createWriteStream')
      .mockReturnValue({ write: jest.fn() } as unknown as fs.WriteStream);

    const repositoryEntities = [
      Artist,
      Disc,
      Country,
      Genre,
      User,
      UserAccessLog,
      Rate,
      NationalRelease,
      RiffValleyPlaylistArtist,
      SpotifyConnection,
    ];

    const testingModule = Test.createTestingModule({
      imports: [CatalogImportModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'catalog-import-module-test-secret') });

    for (const entity of repositoryEntities) {
      testingModule
        .overrideProvider(getRepositoryToken(entity))
        .useValue({});
    }

    moduleRef = await testingModule.compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  it('resolves the manual and Excel controllers and providers', () => {
    const expectedProviders = [
      CatalogImportController,
      CatalogImportService,
      ManualImportLogger,
      ExcelController,
      ExcelImportService,
      ExcelWorkbookParser,
      ExcelTemplateService,
    ];

    for (const provider of expectedProviders) {
      expect(moduleRef.get(provider)).toBeDefined();
    }
  });

  it('wires each import controller and service to its providers', () => {
    const manualController = moduleRef.get(CatalogImportController) as unknown as {
      catalogImportService: CatalogImportService;
    };
    const manualService = moduleRef.get(CatalogImportService) as unknown as {
      manualImportLogger: ManualImportLogger;
    };
    const excelController = moduleRef.get(ExcelController) as unknown as {
      excelService: ExcelImportService;
      excelTemplateService: ExcelTemplateService;
    };
    const excelImportService = moduleRef.get(ExcelImportService) as unknown as {
      workbookParser: ExcelWorkbookParser;
    };

    expect(manualController.catalogImportService).toBe(
      moduleRef.get(CatalogImportService),
    );
    expect(manualService.manualImportLogger).toBe(
      moduleRef.get(ManualImportLogger),
    );
    expect(excelController.excelService).toBe(moduleRef.get(ExcelImportService));
    expect(excelController.excelTemplateService).toBe(
      moduleRef.get(ExcelTemplateService),
    );
    expect(excelImportService.workbookParser).toBe(
      moduleRef.get(ExcelWorkbookParser),
    );
  });
});
