import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { NationalRelease } from 'src/national-releases/entities/national-release.entity';
import { RiffValleyPlaylistArtist } from 'src/festival-playlists/entities/riff-valley-playlist-artist.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { User } from 'src/auth/entities/user.entity';
import { DiscsController } from '../discs/discs.controller';
import { DiscModule } from '../discs/discs.module';
import { DiscsService } from '../discs/discs.service';
import { CatalogModule } from '../catalog.module';
import { GenresModule } from '../genres/genres.module';
import { GenresController } from '../genres/genres.controller';
import { GenresService } from '../genres/genres.service';
import { CountriesModule } from '../countries/countries.module';
import { CountriesController } from '../countries/countries.controller';
import { CountriesService } from '../countries/countries.service';
import { CatalogImportController } from '../import/manual/controller/catalog-import.controller';
import { CatalogImportService } from '../import/manual/import/catalog-import.service';
import { ManualImportLogger } from '../import/manual/logging/manual-import-logger';
import { ExcelController } from '../import/excel/controller/excel.controller';
import { ExcelImportService } from '../import/excel/import/excel-import.service';
import { ExcelWorkbookParser } from '../import/excel/parser/excel-workbook.parser';
import { ExcelTemplateService } from '../import/excel/template/excel-template.service';
import { LastfmModule } from 'src/lastfm/lastfm.module';
import { LastfmService } from 'src/lastfm/lastfm.service';
import { SpotifyConnection } from 'src/spotify-integration';

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
      NationalRelease,
      RiffValleyPlaylistArtist,
      SpotifyConnection,
    ];

    const testingModule = Test.createTestingModule({
      imports: [CatalogModule, LastfmModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'catalog-module-test-secret') });

    for (const entity of repositoryEntities) {
      testingModule.overrideProvider(getRepositoryToken(entity)).useValue({});
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
    const manualController = moduleRef.get(
      CatalogImportController,
    ) as unknown as {
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
    expect(excelController.excelService).toBe(
      moduleRef.get(ExcelImportService),
    );
    expect(excelController.excelTemplateService).toBe(
      moduleRef.get(ExcelTemplateService),
    );
    expect(excelImportService.workbookParser).toBe(
      moduleRef.get(ExcelWorkbookParser),
    );
  });

  it('composes the independent Genres and Countries modules once under Catalog', () => {
    const catalogImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CatalogModule,
    ) as unknown[];

    expect(
      catalogImports.filter((module) => module === GenresModule),
    ).toHaveLength(1);
    expect(
      catalogImports.filter((module) => module === CountriesModule),
    ).toHaveLength(1);
    expect(moduleRef.get(GenresController, { strict: false })).toBeDefined();
    expect(moduleRef.get(GenresService, { strict: false })).toBeDefined();
    expect(moduleRef.get(CountriesController, { strict: false })).toBeDefined();
    expect(moduleRef.get(CountriesService, { strict: false })).toBeDefined();
  });

  it('composes Discs once under Catalog and keeps the direct Last.fm dependency resolvable', () => {
    const catalogImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CatalogModule,
    ) as unknown[];
    const lastfmImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      LastfmModule,
    ) as unknown[];
    const lastfmService = moduleRef.get(LastfmService) as unknown as {
      discsService: DiscsService;
    };

    expect(
      catalogImports.filter((module) => module === DiscModule),
    ).toHaveLength(1);
    expect(
      lastfmImports.filter((module) => module === DiscModule),
    ).toHaveLength(1);
    expect(moduleRef.get(DiscsController, { strict: false })).toBeDefined();
    expect(moduleRef.get(DiscsService, { strict: false })).toBeDefined();
    expect(lastfmService.discsService).toBe(
      moduleRef.get(DiscsService, { strict: false }),
    );
  });
});
