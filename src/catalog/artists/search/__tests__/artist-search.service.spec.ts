import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from '../../entities/artist.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { ArtistSearchService } from '../artist-search.service';

const chainMethods = [
  'leftJoinAndSelect',
  'orderBy',
  'where',
  'addSelect',
] as const;

function queryBuilder(result: Record<string, unknown> = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of chainMethods) qb[method] = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.from = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  qb.getRawAndEntities = jest
    .fn()
    .mockResolvedValue(result.rawAndEntities ?? { raw: [], entities: [] });
  return qb;
}

describe('ArtistSearchService', () => {
  const artistRepository = { createQueryBuilder: jest.fn() };
  const discRepository = { createQueryBuilder: jest.fn() };
  let service: ArtistSearchService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        ArtistSearchService,
        { provide: getRepositoryToken(Artist), useValue: artistRepository },
        { provide: getRepositoryToken(Disc), useValue: discRepository },
      ],
    }).compile();
    service = moduleRef.get(ArtistSearchService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('rejects an empty name before querying', async () => {
    await expect(service.findByName('')).rejects.toMatchObject({
      constructor: BadRequestException,
      message: 'Name parameter is required',
    });
    expect(artistRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('uses a normalized partial match ordered by Artist name and avoids disc loading for no matches', async () => {
    const artistsQb = queryBuilder({ many: [] });
    artistRepository.createQueryBuilder.mockReturnValue(artistsQb);

    await expect(service.findByName('Björk')).resolves.toEqual([]);
    expect(artistsQb.leftJoinAndSelect).toHaveBeenCalledWith(
      'artist.country',
      'country',
    );
    expect(artistsQb.where).toHaveBeenCalledWith(
      'artist.name_normalized LIKE :q',
      { q: '%bjork%' },
    );
    expect(artistsQb.orderBy).toHaveBeenCalledWith('artist.name', 'ASC');
    expect(discRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns the current Artist and Disc projection, including Country, Genre and rate metrics', async () => {
    const artistsQb = queryBuilder({
      many: [
        {
          id: 'artist-id',
          name: 'Artist',
          description: null,
          image: null,
          country: { id: 'country-id', name: 'Country' },
        },
      ],
    });
    artistRepository.createQueryBuilder.mockReturnValue(artistsQb);
    const discQb = queryBuilder({
      rawAndEntities: {
        entities: [
          {
            id: 'disc-id',
            name: 'Album',
            releaseDate: null,
            ep: true,
            debut: false,
            image: null,
            link: null,
            artist: { id: 'artist-id' },
            genre: { id: 'genre-id', name: 'Metal', color: '#111' },
          },
        ],
        raw: [{ rateCount: '3', averageRate: '4.5' }],
      },
    });
    discRepository.createQueryBuilder.mockReturnValue(discQb);

    await expect(service.findByName('Artist')).resolves.toEqual([
      {
        id: 'artist-id',
        name: 'Artist',
        description: null,
        image: null,
        country: { id: 'country-id', name: 'Country' },
        discs: [
          {
            id: 'disc-id',
            name: 'Album',
            releaseDate: null,
            ep: true,
            debut: false,
            image: null,
            link: null,
            genre: { id: 'genre-id', name: 'Metal', color: '#111' },
            rateCount: 3,
            averageRate: 4.5,
          },
        ],
      },
    ]);
    expect(discQb.leftJoinAndSelect).toHaveBeenCalledWith(
      'disc.genre',
      'genre',
    );
    expect(discQb.leftJoinAndSelect).toHaveBeenCalledWith(
      'disc.artist',
      'discArtist',
    );
    expect(discQb.where).toHaveBeenCalledWith(
      'discArtist.id IN (:...artistIds)',
      { artistIds: ['artist-id'] },
    );
    expect(discQb.orderBy).toHaveBeenCalledWith('disc.releaseDate', 'DESC');
  });

  it('maps missing Country and Genre to null and invalid or absent rate aggregates to zero/null', async () => {
    artistRepository.createQueryBuilder.mockReturnValue(
      queryBuilder({
        many: [
          {
            id: 'artist-id',
            name: 'Artist',
            description: null,
            image: null,
            country: undefined,
          },
        ],
      }),
    );
    discRepository.createQueryBuilder.mockReturnValue(
      queryBuilder({
        rawAndEntities: {
          entities: [
            {
              id: 'disc-id',
              name: 'Album',
              artist: { id: 'artist-id' },
              genre: null,
            },
          ],
          raw: [{ rateCount: 'invalid', averageRate: null }],
        },
      }),
    );

    await expect(service.findByName('Artist')).resolves.toEqual([
      {
        id: 'artist-id',
        name: 'Artist',
        description: null,
        image: null,
        country: null,
        discs: [
          {
            id: 'disc-id',
            name: 'Album',
            releaseDate: undefined,
            ep: undefined,
            debut: undefined,
            image: undefined,
            link: undefined,
            genre: null,
            rateCount: 0,
            averageRate: null,
          },
        ],
      },
    ]);
  });

  it('keeps Disc order within each Artist and pairs each entity with its raw metrics by index', async () => {
    artistRepository.createQueryBuilder.mockReturnValue(
      queryBuilder({
        many: [
          { id: 'artist-a', name: 'Artist A', country: null },
          { id: 'artist-b', name: 'Artist B', country: null },
        ],
      }),
    );
    discRepository.createQueryBuilder.mockReturnValue(
      queryBuilder({
        rawAndEntities: {
          entities: [
            {
              id: 'disc-a1',
              name: 'A1',
              artist: { id: 'artist-a' },
              genre: null,
            },
            {
              id: 'disc-b1',
              name: 'B1',
              artist: { id: 'artist-b' },
              genre: null,
            },
            {
              id: 'disc-a2',
              name: 'A2',
              artist: { id: 'artist-a' },
              genre: null,
            },
          ],
          raw: [
            { rateCount: '1', averageRate: '1.25' },
            { rateCount: '2', averageRate: '2.5' },
            { rateCount: '0', averageRate: '0' },
          ],
        },
      }),
    );

    const result = await service.findByName('Artist');

    expect(result.map(({ discs }) => discs)).toEqual([
      [
        expect.objectContaining({
          id: 'disc-a1',
          rateCount: 1,
          averageRate: 1.25,
        }),
        expect.objectContaining({
          id: 'disc-a2',
          rateCount: 0,
          averageRate: 0,
        }),
      ],
      [
        expect.objectContaining({
          id: 'disc-b1',
          rateCount: 2,
          averageRate: 2.5,
        }),
      ],
    ]);
  });

  it('maps duplicate-key errors to 400 and other query failures to the current 500 response', async () => {
    artistRepository.createQueryBuilder.mockImplementationOnce(() => {
      const qb = queryBuilder();
      qb.getMany.mockRejectedValue({ code: '23505', detail: 'duplicate' });
      return qb;
    });
    await expect(service.findByName('Artist')).rejects.toMatchObject({
      constructor: BadRequestException,
      message: 'duplicate',
    });

    artistRepository.createQueryBuilder.mockImplementationOnce(() => {
      const qb = queryBuilder();
      qb.getMany.mockRejectedValue(new Error('query failed'));
      return qb;
    });
    await expect(service.findByName('Artist')).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      message: 'ayuda',
    });
  });
});
