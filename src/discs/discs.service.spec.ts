import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Artist } from '../artists/entities/artist.entity';
import { Country } from '../countries/entities/country.entity';
import { User } from '../auth/entities/user.entity';
import { Genre } from '../genres/entities/genre.entity';
import { SpotifyApiService } from '../wordpress/spotify-api.service';
import { Disc } from './entities/disc.entity';
import { DiscsService } from './discs.service';

describe('DiscsService Spotify album operations', () => {
  const spotifyApiService = {
    resolveAlbum: jest.fn(),
    getAlbumDetails: jest.fn(),
  };

  const service = new DiscsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    spotifyApiService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('resuelve un álbum por nombre y artista', async () => {
    const album = {
      spotifyId: 'spotify-album-id',
      name: 'Álbum',
      listenUrl: 'https://open.spotify.com/album/id',
      coverUrl: 'https://images.spotify.test/cover.jpg',
    };
    spotifyApiService.resolveAlbum.mockResolvedValue(album);

    await expect(service.resolveSpotifyAlbum('Álbum', 'Banda')).resolves.toBe(
      album,
    );
    expect(spotifyApiService.resolveAlbum).toHaveBeenCalledWith(
      'Banda',
      'Álbum',
    );
  });

  it('responde como no encontrado cuando Spotify no encuentra el álbum', async () => {
    spotifyApiService.resolveAlbum.mockResolvedValue(null);

    await expect(
      service.resolveSpotifyAlbum('Desconocido', 'Banda'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('obtiene el detalle por ID Spotify', async () => {
    const details = { spotifyId: 'spotify-album-id', tracks: [] };
    spotifyApiService.getAlbumDetails.mockResolvedValue(details);

    await expect(
      service.getSpotifyAlbumDetails('spotify-album-id'),
    ).resolves.toBe(details);
    expect(spotifyApiService.getAlbumDetails).toHaveBeenCalledWith(
      'spotify-album-id',
    );
  });
});

describe('DiscsService baseline', () => {
  let service: DiscsService;
  let discRepository: { findOneByOrFail: jest.Mock };
  let spotifyApiService: { getAlbumTracks: jest.Mock };

  beforeEach(() => {
    discRepository = { findOneByOrFail: jest.fn() };
    spotifyApiService = { getAlbumTracks: jest.fn() };

    service = new DiscsService(
      discRepository as unknown as Repository<Disc>,
      {} as Repository<Artist>,
      {} as Repository<Genre>,
      {} as Repository<Country>,
      spotifyApiService as unknown as SpotifyApiService,
    );
  });

  it('can be instantiated with the four repositories and Spotify dependency', () => {
    expect(service).toBeInstanceOf(DiscsService);
  });

  it('finds a disc by id', async () => {
    const disc = { id: 'disc-id', name: 'Album' } as Disc;
    discRepository.findOneByOrFail.mockResolvedValue(disc);

    await expect(service.findOne(disc.id)).resolves.toBe(disc);
    expect(discRepository.findOneByOrFail).toHaveBeenCalledWith({ id: disc.id });
  });

  it('represents a missing disc as a not-found error', async () => {
    discRepository.findOneByOrFail.mockRejectedValue(new Error('missing'));

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('passes a found disc name and artist name to Spotify', async () => {
    discRepository.findOneByOrFail.mockResolvedValue({
      id: 'disc-id',
      name: 'Album',
      artist: { name: 'Artist' },
    });
    spotifyApiService.getAlbumTracks.mockResolvedValue([]);

    await expect(service.getSpotifyTracks('disc-id')).resolves.toEqual([]);
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith(
      'Artist',
      'Album',
    );
  });

  it('uses empty artist name when a found disc has no artist', async () => {
    discRepository.findOneByOrFail.mockResolvedValue({
      id: 'disc-id',
      name: 'Album',
      artist: null,
    });
    spotifyApiService.getAlbumTracks.mockResolvedValue([]);

    await service.getSpotifyTracks('disc-id');

    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith('', 'Album');
  });
});

describe('DiscsService.findAll filters', () => {
  let service: DiscsService;
  let queryBuilders: any[];
  let resultEntities: Disc[];
  let rawResult: Record<string, unknown>[];

  beforeEach(() => {
    queryBuilders = [];
    resultEntities = [];
    rawResult = [];
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const builder: any = {};
        for (const method of [
          'leftJoinAndSelect', 'leftJoin', 'addSelect', 'where', 'andWhere',
          'addOrderBy', 'orderBy', 'take', 'skip',
        ]) {
          builder[method] = jest.fn(() => builder);
        }
        builder.getRawAndEntities = jest.fn().mockImplementation(() =>
          Promise.resolve({ entities: resultEntities, raw: rawResult }),
        );
        builder.getCount = jest.fn().mockResolvedValue(0);
        queryBuilders.push(builder);
        return builder;
      }),
    };

    service = new DiscsService(
      repository as unknown as Repository<Disc>,
      {} as Repository<Artist>,
      {} as Repository<Genre>,
      {} as Repository<Country>,
      {} as SpotifyApiService,
    );
  });

  const filtersFor = (builder: (typeof queryBuilders)[number]) =>
    builder.andWhere.mock.calls.map(([condition, parameters]) => ({
      condition,
      parameters,
    }));

  const run = async (filters: Record<string, unknown>) => {
    await service.findAll(filters as any, { id: 'user-id' } as User);
    return queryBuilders;
  };

  it('uses the current ILIKE search expression and wildcard wrapping', async () => {
    const builders = await run({ query: 'Echo_%' });
    const expected = {
      condition: '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)',
      parameters: { search: '%Echo_%%' },
    };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('filters by genre in both result and count queries', async () => {
    const builders = await run({ genre: 'genre-id' });
    const expected = { condition: 'disc.genreId = :genre', parameters: { genre: 'genre-id' } };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it.each([
    ['UUID country', 'a1234567-89ab-cdef-0123-456789abcdef', 'country.id = :countryFilter'],
    ['country name', 'España', 'country.name = :countryFilter'],
  ])('resolves %s using the existing country selector', async (_label, countryFilter, condition) => {
    const builders = await run({ country: countryFilter });
    const expected = { condition, parameters: { countryFilter } };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('prefers country over countryId when both are present', async () => {
    const builders = await run({ country: 'España', countryId: 'a1234567-89ab-cdef-0123-456789abcdef' });

    expect(filtersFor(builders[0])).toContainEqual({
      condition: 'country.name = :countryFilter',
      parameters: { countryFilter: 'España' },
    });
    expect(filtersFor(builders[0]).some(({ parameters }) => parameters?.countryFilter === 'a1234567-89ab-cdef-0123-456789abcdef')).toBe(false);
  });

  it.each([
    ['false', 'rate.rate IS NULL'],
    [false, 'rate.rate IS NULL'],
    ['true', 'rate.rate IS NOT NULL'],
    [true, 'rate.rate IS NOT NULL'],
  ])('preserves voted=%s default rate behavior', async (voted, condition) => {
    const builders = await run({ voted });
    const expected = { condition, parameters: undefined };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it.each([
    ['false', 'cover', 'rate.cover IS NULL'],
    ['true', 'cover', 'rate.cover IS NOT NULL'],
    ['true', 'both', 'rate.rate IS NOT NULL'],
    ['false', 'unexpected', 'rate.rate IS NULL'],
  ])('preserves voted=%s with votedType=%s behavior', async (voted, votedType, condition) => {
    const builders = await run({ voted, votedType });
    const expected = { condition, parameters: undefined };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('uses inclusive BETWEEN bounds for a two-date range in both queries', async () => {
    const startDate = new Date('2024-01-01T00:00:00.000Z');
    const endDate = new Date('2024-12-31T23:59:59.999Z');
    const builders = await run({ dateRange: [startDate, endDate] });
    const expected = {
      condition: 'disc.releaseDate BETWEEN :startDate AND :endDate',
      parameters: { startDate, endDate },
    };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('ignores a date range unless it has exactly two values', async () => {
    const builders = await run({ dateRange: [new Date('2024-01-01T00:00:00.000Z')] });

    expect(filtersFor(builders[0]).some(({ condition }) => condition.includes('BETWEEN'))).toBe(false);
    expect(filtersFor(builders[1]).some(({ condition }) => condition.includes('BETWEEN'))).toBe(false);
  });

  it('applies a representative combination identically to results and count', async () => {
    const filters = {
      query: 'Echo',
      genre: 'genre-id',
      countryId: 'a1234567-89ab-cdef-0123-456789abcdef',
      dateRange: [new Date('2020-01-01T00:00:00.000Z'), new Date('2025-01-01T00:00:00.000Z')],
      voted: 'false',
      votedType: 'cover',
    };
    const builders = await run(filters);

    expect(filtersFor(builders[0])).toEqual(filtersFor(builders[1]));
  });

  it('adds no optional filter predicates when values are absent', async () => {
    const builders = await run({});

    expect(filtersFor(builders[0])).toEqual([]);
    expect(filtersFor(builders[1])).toEqual([]);
  });

  it('characterizes the current findAll entity payload and selected relations', async () => {
    const disc = {
      id: 'disc-id',
      name: 'Album',
      description: null,
      artist: {
        id: 'artist-id',
        name: 'Artist',
        country: { id: 'country-id', name: 'Country', isoCode: 'CT' },
      },
      genre: { id: 'genre-id', name: 'Genre' },
      rates: [{ id: 'rate-id', rate: 4, cover: null }],
      favorites: [{ id: 'favorite-id' }],
      pendings: [{ id: 'pending-id' }],
    } as unknown as Disc;
    resultEntities = [disc];
    rawResult = [{ averagerate: '4', averageCover: null, commentCount: '2', rateCount: '1' }];

    const result = await service.findAll({} as any, { id: 'user-id' } as User);

    expect(result.data[0]).toEqual({
      ...disc,
      artist: {
        ...disc.artist,
        country: { ...disc.artist.country, name: 'Country' },
      },
      userRate: disc.rates[0],
      averageRate: 4,
      averageCover: null,
      commentCount: 2,
      voteCount: 1,
      favoriteId: 'favorite-id',
      pendingId: 'pending-id',
    });
    expect(queryBuilders[0].leftJoinAndSelect.mock.calls.map(([relation]) => relation)).toEqual([
      'disc.artist',
      'artist.country',
      'disc.genre',
      'disc.rates',
      'disc.favorites',
      'disc.pendings',
    ]);
    expect(queryBuilders[1].leftJoin.mock.calls.map(([relation]) => relation)).toEqual([
      'disc.artist',
      'artist.country',
      'disc.rates',
    ]);
  });
});
