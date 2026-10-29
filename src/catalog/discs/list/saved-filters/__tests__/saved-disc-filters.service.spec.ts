import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import {
  CreateSavedDiscFilterDto,
  SavedDiscFilterCriteriaDto,
} from '../dto/saved-disc-filter.dto';
import { SavedDiscFilter } from '../entities/saved-disc-filter.entity';
import { SavedDiscFiltersService } from '../saved-disc-filters.service';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const GENRE_ID = '00000000-0000-4000-8000-000000000003';
const STALE_GENRE_ID = '00000000-0000-4000-8000-000000000004';
const COUNTRY_ID = '00000000-0000-4000-8000-000000000005';

type FilterRepository = Pick<
  Repository<SavedDiscFilter>,
  'find' | 'findOne' | 'save' | 'delete'
>;
type CatalogRepository<T> = Pick<Repository<T>, 'find'>;
type TransactionRepository = Pick<
  Repository<SavedDiscFilter>,
  'count' | 'save'
>;
type TransactionManager = {
  query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  getRepository: jest.Mock<TransactionRepository, [typeof SavedDiscFilter]>;
};
type TransactionSource = {
  transaction<T>(run: (manager: TransactionManager) => Promise<T>): Promise<T>;
};

function savedFilter(
  overrides: Partial<SavedDiscFilter> = {},
): SavedDiscFilter {
  return {
    id: '00000000-0000-4000-8000-000000000006',
    userId: USER_ID,
    name: 'Metal',
    filters: {
      genreIds: [GENRE_ID],
      countryId: null,
      yearFrom: null,
      yearTo: 2026,
    },
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('SavedDiscFiltersService', () => {
  let service: SavedDiscFiltersService;
  let filtersRepository: jest.Mocked<FilterRepository>;
  let genresRepository: jest.Mocked<CatalogRepository<Genre>>;
  let countriesRepository: jest.Mocked<CatalogRepository<Country>>;
  let dataSource: TransactionSource;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let transactionManager: TransactionManager;

  beforeEach(() => {
    filtersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    genresRepository = { find: jest.fn() };
    countriesRepository = { find: jest.fn() };
    transactionRepository = {
      count: jest.fn(),
      save: jest.fn(),
    };
    transactionManager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue(transactionRepository),
    };
    dataSource = {
      transaction: async <T>(
        run: (manager: TransactionManager) => Promise<T>,
      ) => run(transactionManager),
    };
    service = new SavedDiscFiltersService(
      dataSource,
      filtersRepository,
      genresRepository,
      countriesRepository,
    );
    genresRepository.find.mockResolvedValue([{ id: GENRE_ID } as Genre]);
    countriesRepository.find.mockResolvedValue([{ id: COUNTRY_ID } as Country]);
  });

  it('creates normalized criteria inside an owner-locked transaction', async () => {
    const entity = savedFilter({
      name: 'Metal',
      filters: {
        genreIds: [GENRE_ID],
        countryId: COUNTRY_ID,
        yearFrom: null,
        yearTo: 2026,
      },
    });
    const dto: CreateSavedDiscFilterDto = {
      name: ' Metal ',
      filters: Object.assign(new SavedDiscFilterCriteriaDto(), {
        genreIds: [GENRE_ID.toUpperCase()],
        countryId: COUNTRY_ID.toUpperCase(),
        yearFrom: null,
        yearTo: 2026,
      }),
    };
    transactionRepository.count.mockResolvedValue(0);
    transactionRepository.save.mockResolvedValue(entity);

    await expect(service.create(USER_ID, dto)).resolves.toMatchObject({
      name: 'Metal',
      filters: {
        genreIds: [GENRE_ID],
        countryId: COUNTRY_ID,
        yearFrom: null,
        yearTo: 2026,
      },
    });
    expect(transactionManager.query).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE "id" = $1 FOR UPDATE',
      [USER_ID],
    );
    expect(transactionRepository.count).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('returns only the authenticated owner’s filters in stable order', async () => {
    filtersRepository.find.mockResolvedValue([savedFilter()]);

    await expect(service.findAll(USER_ID)).resolves.toHaveLength(1);
    expect(filtersRepository.find).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  });

  it('allows duplicate names and rejects creation after the 20-filter limit', async () => {
    const dto = {
      name: 'Metal',
      filters: Object.assign(new SavedDiscFilterCriteriaDto(), {
        genreIds: [],
        countryId: null,
        yearFrom: null,
        yearTo: null,
      }),
    };
    transactionRepository.count.mockResolvedValue(0);
    transactionRepository.save.mockResolvedValue(savedFilter());
    await expect(service.create(USER_ID, dto)).resolves.toMatchObject({
      name: 'Metal',
    });
    await expect(service.create(USER_ID, dto)).resolves.toMatchObject({
      name: 'Metal',
    });
    expect(transactionRepository.save).toHaveBeenCalledTimes(2);

    transactionRepository.save.mockClear();
    transactionRepository.count.mockResolvedValue(20);
    await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transactionRepository.save).not.toHaveBeenCalled();
  });

  it('renames and replaces criteria only for the owning user', async () => {
    filtersRepository.findOne.mockResolvedValue(savedFilter());
    filtersRepository.save.mockResolvedValue(
      savedFilter({
        name: 'Nuevo',
        filters: {
          genreIds: [],
          countryId: null,
          yearFrom: 1990,
          yearTo: null,
        },
      }),
    );

    await expect(
      service.update(USER_ID, savedFilter().id, {
        name: '  Nuevo  ',
        filters: Object.assign(new SavedDiscFilterCriteriaDto(), {
          genreIds: [],
          countryId: null,
          yearFrom: 1990,
          yearTo: null,
        }),
      }),
    ).resolves.toMatchObject({
      name: 'Nuevo',
      filters: { genreIds: [], yearFrom: 1990, yearTo: null },
    });
    expect(filtersRepository.findOne).toHaveBeenCalledWith({
      where: { id: savedFilter().id, userId: USER_ID },
    });

    filtersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.update(OTHER_USER_ID, savedFilter().id, { name: 'No' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an empty patch', async () => {
    await expect(
      service.update(USER_ID, savedFilter().id, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(filtersRepository.findOne).not.toHaveBeenCalled();
  });

  it('deletes by both owner and id and returns the same not-found result for foreign IDs', async () => {
    filtersRepository.delete.mockResolvedValue({ affected: 1, raw: [] });
    await expect(
      service.remove(USER_ID, savedFilter().id),
    ).resolves.toBeUndefined();
    expect(filtersRepository.delete).toHaveBeenCalledWith({
      id: savedFilter().id,
      userId: USER_ID,
    });

    filtersRepository.delete.mockResolvedValue({ affected: 0, raw: [] });
    await expect(
      service.remove(OTHER_USER_ID, savedFilter().id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves deleted genre and country references and reports them for frontend warnings', async () => {
    filtersRepository.find.mockResolvedValue([
      savedFilter({
        filters: {
          genreIds: [GENRE_ID, STALE_GENRE_ID],
          countryId: COUNTRY_ID,
          yearFrom: null,
          yearTo: null,
        },
      }),
    ]);
    genresRepository.find.mockResolvedValue([{ id: GENRE_ID } as Genre]);
    countriesRepository.find.mockResolvedValue([]);

    await expect(service.findAll(USER_ID)).resolves.toMatchObject([
      {
        filters: {
          genreIds: [GENRE_ID, STALE_GENRE_ID],
          countryId: COUNTRY_ID,
        },
        missingGenreIds: [STALE_GENRE_ID],
        countryMissing: true,
      },
    ]);
  });
});
