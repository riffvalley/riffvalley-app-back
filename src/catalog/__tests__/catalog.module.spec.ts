import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { Artist } from 'src/artists/entities/artist.entity';
import { Country } from 'src/countries/entities/country.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { Rate } from 'src/rates/entities/rate.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { User } from 'src/auth/entities/user.entity';
import { CatalogModule } from '../catalog.module';
import { CatalogImportController } from '../import/manual/controller/catalog-import.controller';
import { CatalogImportService } from '../import/manual/import/catalog-import.service';
import { ManualImportLogger } from '../import/manual/logging/manual-import-logger';
import { ExcelController } from '../import/excel/controller/excel.controller';
import { ExcelImportService } from '../import/excel/import/excel-import.service';
import { ExcelWorkbookParser } from '../import/excel/parser/excel-workbook.parser';
import { ExcelTemplateService } from '../import/excel/template/excel-template.service';

describe('CatalogModule dependency injection', () => {
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
    ];

    const testingModule = Test.createTestingModule({
      imports: [CatalogModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'catalog-module-test-secret') });

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

  it('wires each controller and service to the providers for its responsibility', () => {
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
