import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from '../../artists/entities/artist.entity';
import { Country } from '../../countries/entities/country.entity';
import { Disc } from '../../discs/entities/disc.entity';
import { Genre } from '../../genres/entities/genre.entity';
import { Tour } from '../../tours/entities/tour.entity';
import { Locality } from '../../venues/entities/locality.entity';
import { Venue } from '../../venues/entities/venue.entity';
import { Rate } from '../../../community/rates/entities/rate.entity';
import { NationalRelease } from '../../../editorial/national-releases/entities/national-release.entity';
import { RiffValleyPlaylistArtist } from '../../../editorial/playlists/spotify-playlists/entities/riff-valley-playlist-artist.entity';
import { UserAccessLog } from '../../../identity/auth/entities/user-access-log.entity';
import { User } from '../../../identity/auth/entities/user.entity';
import { SpotifyConnection } from '../../../integrations/spotify-integration/oauth/spotify-connection.entity';
import { CatalogImportModule } from '../catalog-import.module';
import { CatalogImportController } from '../manual/controller/catalog-import.controller';
import { CatalogImportService } from '../manual/import/catalog-import.service';
import { ManualImportLogger } from '../manual/logging/manual-import-logger';
import { ExcelController } from '../excel/controller/excel.controller';
import { ExcelImportService } from '../excel/import/excel-import.service';
import { ExcelWorkbookParser } from '../excel/parser/excel-workbook.parser';
import { ExcelTemplateService } from '../excel/template/excel-template.service';
import { ImportEntityResolversService } from '../resolution/import-entity-resolvers.service';
import { VenuesService } from '../../venues/venues.service';
import { NominatimGeocoderService } from '../../venues/localities/nominatim-geocoder.service';
import { Event } from '../../events/entities/event.entity';
import { ImportConflictsService } from '../conflicts/import-conflicts.service';

@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken(),
      useValue: { getRepository: jest.fn(() => ({})) },
    },
  ],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

describe('CatalogImportModule dependency injection', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
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
      Tour,
      Locality,
      Venue,
      Event,
    ];

    const testingModule = Test.createTestingModule({
      imports: [MockDataSourceModule, CatalogImportModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'catalog-import-module-test-secret') })
      .overrideProvider(ManualImportLogger)
      .useValue({ log: jest.fn() });

    for (const entity of repositoryEntities) {
      testingModule.overrideProvider(getRepositoryToken(entity)).useValue({});
    }

    moduleRef = await testingModule.compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
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
      ImportEntityResolversService,
      VenuesService,
      NominatimGeocoderService,
      ImportConflictsService,
    ];

    for (const provider of expectedProviders) {
      expect(moduleRef.get(provider)).toBeDefined();
    }
  });

  it('wires each import controller and service to its providers', () => {
    const manualController = moduleRef.get(CatalogImportController);
    const manualService = moduleRef.get(CatalogImportService);
    const excelController = moduleRef.get(ExcelController);
    const excelImportService = moduleRef.get(ExcelImportService);

    expect(Reflect.get(manualController, 'catalogImportService')).toBe(
      moduleRef.get(CatalogImportService),
    );
    expect(Reflect.get(manualService, 'manualImportLogger')).toBe(
      moduleRef.get(ManualImportLogger),
    );
    expect(Reflect.get(excelController, 'excelService')).toBe(
      moduleRef.get(ExcelImportService),
    );
    expect(Reflect.get(excelController, 'excelTemplateService')).toBe(
      moduleRef.get(ExcelTemplateService),
    );
    expect(Reflect.get(excelImportService, 'workbookParser')).toBe(
      moduleRef.get(ExcelWorkbookParser),
    );
  });
});
