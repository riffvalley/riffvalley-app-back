import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Country } from '../../countries/entities/country.entity';
import { Genre } from '../../genres/entities/genre.entity';
import { CatalogController } from '../catalog.controller';
import { CommonModule } from '../common.module';

describe('GET /api/catalog', () => {
  let moduleRef: TestingModule;
  let controller: CatalogController;
  const genreRepository = { find: jest.fn() };
  const countryRepository = { find: jest.fn() };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [CommonModule] })
      .overrideProvider(getRepositoryToken(Genre))
      .useValue(genreRepository)
      .overrideProvider(getRepositoryToken(Country))
      .useValue(countryRepository)
      .compile();

    controller = moduleRef.get(CatalogController);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes a public GET /catalog handler with its existing response shape and ordering', async () => {
    const genres = [
      { id: 'genre-2', name: 'Zulu', color: '#222222' },
      { id: 'genre-1', name: 'Alpha', color: '#111111' },
    ];
    const countries = [
      { id: 'country-2', name: 'Spain', isoCode: 'ES' },
      { id: 'country-1', name: 'Argentina', isoCode: 'AR' },
    ];
    genreRepository.find.mockResolvedValue(genres);
    countryRepository.find.mockResolvedValue(countries);

    expect(Reflect.getMetadata(PATH_METADATA, CatalogController)).toBe(
      'catalog',
    );
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        CatalogController.prototype.getCatalog,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        CatalogController.prototype.getCatalog,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CatalogController),
    ).toBeUndefined();
    await expect(controller.getCatalog()).resolves.toEqual({
      genres,
      countries,
    });

    expect(genreRepository.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
    });
    expect(countryRepository.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
    });
  });

  it('returns empty arrays when both repositories have no rows', async () => {
    genreRepository.find.mockResolvedValue([]);
    countryRepository.find.mockResolvedValue([]);

    await expect(controller.getCatalog()).resolves.toEqual({
      genres: [],
      countries: [],
    });
  });

  it('resolves the controller and both repository dependencies through Nest', () => {
    const controller = moduleRef.get(CatalogController) as unknown as {
      genreRepo: unknown;
      countryRepo: unknown;
    };

    expect(controller.genreRepo).toBe(genreRepository);
    expect(controller.countryRepo).toBe(countryRepository);
  });
});
