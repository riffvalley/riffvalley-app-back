import { DiscCatalogService } from '../../catalog/disc-catalog.service';
import { Artist } from '../../../artists/entities/artist.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Disc } from '../../entities/disc.entity';
import { Genre } from '../../../genres/entities/genre.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { DiscListService } from '../disc-list.service';
import { DiscListMode, DiscListQueryDto } from '../dto/disc-list-contracts.dto';
import { DiscListSourceDisc } from '../helpers/map-disc-list-items';
import {
  DiscListReaderCommentRecord,
  DiscListReaderFavoriteRecord,
  DiscListReaderPage,
  DiscListReaderPendingRecord,
  DiscListReaderRateRecord,
} from 'src/community/common/types/disc-list-reader-criteria';
import { CommentsDiscListReader } from 'src/community/comments/disc-list/comments-disc-list.reader';
import { FavoritesDiscListReader } from 'src/community/favorites/disc-list/favorites-disc-list.reader';
import { PendingsDiscListReader } from 'src/community/pendings/disc-list/pendings-disc-list.reader';
import { RatesDiscListReader } from 'src/community/rates/disc-list/rates-disc-list.reader';
import { User } from 'src/identity/auth/entities/user.entity';

type CatalogPage = Awaited<ReturnType<DiscCatalogService['findDiscList']>>;
type CatalogReaderMock = Pick<
  DiscCatalogService,
  'findDiscList' | 'findDiscListOptions'
> & {
  findDiscList: jest.Mock<
    ReturnType<DiscCatalogService['findDiscList']>,
    Parameters<DiscCatalogService['findDiscList']>
  >;
  findDiscListOptions: jest.Mock<
    ReturnType<DiscCatalogService['findDiscListOptions']>,
    Parameters<DiscCatalogService['findDiscListOptions']>
  >;
};
type RatesReaderMock = Pick<
  RatesDiscListReader,
  'findByUser' | 'findOptions'
> & {
  findByUser: jest.Mock<
    Promise<DiscListReaderPage<DiscListReaderRateRecord>>,
    Parameters<RatesDiscListReader['findByUser']>
  >;
  findOptions: jest.Mock<
    ReturnType<RatesDiscListReader['findOptions']>,
    Parameters<RatesDiscListReader['findOptions']>
  >;
};
type CommentsReaderMock = Pick<
  CommentsDiscListReader,
  'findByUser' | 'findOptions'
> & {
  findByUser: jest.Mock<
    Promise<DiscListReaderPage<DiscListReaderCommentRecord>>,
    Parameters<CommentsDiscListReader['findByUser']>
  >;
  findOptions: jest.Mock<
    ReturnType<CommentsDiscListReader['findOptions']>,
    Parameters<CommentsDiscListReader['findOptions']>
  >;
};
type FavoritesReaderMock = Pick<
  FavoritesDiscListReader,
  'findByUser' | 'findOptions'
> & {
  findByUser: jest.Mock<
    Promise<DiscListReaderPage<DiscListReaderFavoriteRecord>>,
    Parameters<FavoritesDiscListReader['findByUser']>
  >;
  findOptions: jest.Mock<
    ReturnType<FavoritesDiscListReader['findOptions']>,
    Parameters<FavoritesDiscListReader['findOptions']>
  >;
};
type PendingsReaderMock = Pick<
  PendingsDiscListReader,
  'findByUser' | 'findOptions'
> & {
  findByUser: jest.Mock<
    Promise<DiscListReaderPage<DiscListReaderPendingRecord>>,
    Parameters<PendingsDiscListReader['findByUser']>
  >;
  findOptions: jest.Mock<
    ReturnType<PendingsDiscListReader['findOptions']>,
    Parameters<PendingsDiscListReader['findOptions']>
  >;
};

function readerPage<T>(
  data: T[],
  totalItems = data.length,
): DiscListReaderPage<T> {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / 20),
    currentPage: 1,
    limit: 20,
    data,
  };
}

function createDisc(): DiscListSourceDisc {
  return {
    id: 'disc-1',
    name: 'Record',
    image: 'https://images.example/record.jpg',
    releaseDate: '2026-01-01',
    link: 'https://open.spotify.com/album/record',
    ep: false,
    debut: true,
    artist: {
      name: 'Artist',
      country: { id: 'country-1', name: 'Norway', isoCode: 'NO' },
    },
    genre: { id: 'genre-1', name: 'Metal', color: '#111111' },
    averageRate: '8.5',
    averageCover: null,
    voteCount: '2',
    commentCount: '3',
    userRate: { id: 'rate-1', rate: '9.0', cover: null },
    favoriteId: 'favorite-1',
    pendingId: 'pending-1',
  };
}

describe('DiscListService', () => {
  let service: DiscListService;
  let catalog: CatalogReaderMock;
  let rates: RatesReaderMock;
  let comments: CommentsReaderMock;
  let favorites: FavoritesReaderMock;
  let pendings: PendingsReaderMock;
  let user: User;

  beforeEach(() => {
    catalog = {
      findDiscList: jest.fn(),
      findDiscListOptions: jest.fn(),
    };
    rates = { findByUser: jest.fn(), findOptions: jest.fn() };
    comments = { findByUser: jest.fn(), findOptions: jest.fn() };
    favorites = { findByUser: jest.fn(), findOptions: jest.fn() };
    pendings = { findByUser: jest.fn(), findOptions: jest.fn() };
    user = Object.assign(new User(), { id: 'session-user' });
    service = new DiscListService(
      catalog,
      rates,
      comments,
      favorites,
      pendings,
    );
  });

  it('delegates all mode to Catalog with the original authenticated user and normalized metadata', async () => {
    const disc: CatalogPage['data'][number] = Object.assign(
      new Disc(),
      createDisc(),
      {
        artist: Object.assign(new Artist(), {
          name: 'Artist',
          country: Object.assign(new Country(), {
            id: 'country-1',
            name: 'Norway',
            isoCode: 'NO',
          }),
        }),
        genre: Object.assign(new Genre(), {
          id: 'genre-1',
          name: 'Metal',
          color: '#111111',
        }),
        rates: [
          Object.assign(new Rate(), { id: 'rate-1', rate: 9, cover: null }),
        ],
        favorites: [],
        pendings: [],
        comments: [],
        userRate: Object.assign(new Rate(), {
          id: 'rate-1',
          rate: 9,
          cover: null,
        }),
        averageRate: 8.5,
        averageCover: null,
        voteCount: 2,
        commentCount: 3,
        favoriteId: 'favorite-1',
        pendingId: 'pending-1',
      },
    );
    const page: CatalogPage = {
      totalItems: 41,
      totalPages: 21,
      currentPage: 3,
      limit: 2,
      data: [disc],
    };
    catalog.findDiscList.mockResolvedValue(page);
    const query = Object.assign(new DiscListQueryDto(), {
      mode: DiscListMode.ALL,
      limit: 2,
      offset: 4,
    });

    await expect(service.findAll(query, user)).resolves.toMatchObject({
      totalItems: 41,
      totalPages: 21,
      currentPage: 3,
      limit: 2,
      data: [
        {
          itemType: 'disc',
          entryId: 'disc-1',
          averageRate: 8.5,
          voteCount: 2,
          commentCount: 3,
          userRate: { id: 'rate-1', rate: 9, cover: null },
          favoriteId: 'favorite-1',
          pendingId: 'pending-1',
        },
      ],
    });
    expect(catalog.findDiscList).toHaveBeenCalledWith(query, user);
    expect(rates.findByUser).not.toHaveBeenCalled();
  });

  it.each([
    [DiscListMode.RATES, 'rates', 'rate'],
    [DiscListMode.COVERS, 'covers', 'cover'],
  ] as const)(
    'delegates %s mode to Rates and identifies its normalized item',
    async (mode, readerMode, itemType) => {
      const record: DiscListReaderRateRecord = {
        id: 'rate-entry',
        rate: 8.5,
        cover: 7,
        disc: createDisc(),
      };
      rates.findByUser.mockResolvedValue(readerPage([record], 5));
      const query = Object.assign(new DiscListQueryDto(), {
        mode,
        limit: 20,
      });

      const result = await service.findAll(query, user);

      expect(result).toMatchObject({
        totalItems: 5,
        data: [{ itemType, entryId: 'rate-entry', id: 'disc-1' }],
      });
      expect(rates.findByUser).toHaveBeenCalledWith(
        readerMode,
        {
          limit: 20,
          offset: 0,
          query: undefined,
          dateRange: undefined,
          countryId: undefined,
          genreId: undefined,
          sort: undefined,
        },
        user,
      );
      expect(catalog.findDiscList).not.toHaveBeenCalled();
    },
  );

  it('counts and preserves repeated comments as distinct items with the comment view projection', async () => {
    const disc = createDisc();
    const records: DiscListReaderCommentRecord[] = [
      {
        id: 'comment-1',
        comment: 'First',
        createdAt: new Date('2026-01-02'),
        disc,
      },
      {
        id: 'comment-2',
        comment: 'Second',
        createdAt: new Date('2026-01-03'),
        disc,
      },
    ];
    comments.findByUser.mockResolvedValue(readerPage(records, 2));
    const query = Object.assign(new DiscListQueryDto(), {
      mode: DiscListMode.COMMENTS,
    });

    const result = await service.findAll(query, user);

    expect(result).toMatchObject({
      totalItems: 2,
      data: [
        { itemType: 'comment', entryId: 'comment-1', comment: 'First' },
        { itemType: 'comment', entryId: 'comment-2', comment: 'Second' },
      ],
    });
    expect(result.data[0]).toMatchObject({
      disc: {
        id: 'disc-1',
        artist: { country: { isoCode: 'NO' } },
        genre: { name: 'Metal' },
      },
    });
    expect(result.data[0]).not.toHaveProperty('disc.averageRate');
    expect(comments.findByUser).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
      user,
    );
  });

  it('delegates favorites and pending items to their owners and preserves owner IDs', async () => {
    const favorite: DiscListReaderFavoriteRecord = {
      id: 'favorite-entry',
      disc: {
        ...createDisc(),
        pendingId: null,
        userPending: { id: 'pending-from-favorite' },
      },
    };
    const pending: DiscListReaderPendingRecord = {
      id: 'pending-entry',
      disc: {
        ...createDisc(),
        favoriteId: null,
        userFavorite: { id: 'favorite-from-pending' },
      },
    };
    favorites.findByUser.mockResolvedValue(readerPage([favorite], 1));
    pendings.findByUser.mockResolvedValue(readerPage([pending], 1));

    const favoriteResult = await service.findAll(
      Object.assign(new DiscListQueryDto(), { mode: DiscListMode.FAVORITES }),
      user,
    );
    const pendingResult = await service.findAll(
      Object.assign(new DiscListQueryDto(), { mode: DiscListMode.PENDIENTES }),
      user,
    );

    expect(favoriteResult.data[0]).toMatchObject({
      itemType: 'favorite',
      entryId: 'favorite-entry',
      favoriteId: 'favorite-entry',
      pendingId: 'pending-from-favorite',
    });
    expect(pendingResult.data[0]).toMatchObject({
      itemType: 'pending',
      entryId: 'pending-entry',
      pendingId: 'pending-entry',
      favoriteId: 'favorite-from-pending',
    });
    expect(favorites.findByUser).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
      user,
    );
    expect(pendings.findByUser).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
      user,
    );
  });

  it('returns empty pages and propagates owner errors unchanged', async () => {
    const query = Object.assign(new DiscListQueryDto(), {
      mode: DiscListMode.COVERS,
      limit: 5,
      offset: 10,
    });
    rates.findByUser.mockResolvedValue({
      totalItems: 0,
      totalPages: 0,
      currentPage: 3,
      limit: 5,
      data: [],
    });
    await expect(service.findAll(query, user)).resolves.toMatchObject({
      totalItems: 0,
      totalPages: 0,
      currentPage: 3,
      limit: 5,
      data: [],
    });

    const failure = new Error('reader failed');
    rates.findByUser.mockRejectedValue(failure);
    await expect(service.findAll(query, user)).rejects.toBe(failure);
  });

  it.each([
    [DiscListMode.ALL, 'all'],
    [DiscListMode.RATES, 'rates'],
    [DiscListMode.COVERS, 'covers'],
    [DiscListMode.COMMENTS, 'comments'],
    [DiscListMode.FAVORITES, 'favorites'],
    [DiscListMode.PENDIENTES, 'pendientes'],
  ] as const)(
    'delegates options for mode %s to its owner',
    async (mode, owner) => {
      const query = {
        mode,
        query: 'black metal',
        dateRange: [new Date('2026-01-01'), new Date('2026-12-31')] as [
          Date,
          Date,
        ],
        countryId: 'country-id',
        genreId: 'genre-id',
      };
      const result = { countries: [], genres: [] };
      if (owner === 'all') {
        catalog.findDiscListOptions.mockResolvedValue(result);
      } else if (owner === 'rates' || owner === 'covers') {
        rates.findOptions.mockResolvedValue(result);
      } else if (owner === 'comments') {
        comments.findOptions.mockResolvedValue(result);
      } else if (owner === 'favorites') {
        favorites.findOptions.mockResolvedValue(result);
      } else {
        pendings.findOptions.mockResolvedValue(result);
      }

      await expect(service.findOptions(query, user)).resolves.toBe(result);
      const criteria = {
        query: query.query,
        dateRange: query.dateRange,
        countryId: query.countryId,
        genreId: query.genreId,
      };
      if (owner === 'all') {
        expect(catalog.findDiscListOptions).toHaveBeenCalledWith(query, user);
      } else if (owner === 'rates' || owner === 'covers') {
        expect(rates.findOptions).toHaveBeenCalledWith(owner, criteria, user);
      } else if (owner === 'comments') {
        expect(comments.findOptions).toHaveBeenCalledWith(criteria, user);
      } else if (owner === 'favorites') {
        expect(favorites.findOptions).toHaveBeenCalledWith(criteria, user);
      } else {
        expect(pendings.findOptions).toHaveBeenCalledWith(criteria, user);
      }
    },
  );
});
