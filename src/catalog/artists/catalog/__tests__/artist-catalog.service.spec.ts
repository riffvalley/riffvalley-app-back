import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from '../../entities/artist.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ArtistCatalogService } from '../artist-catalog.service';

describe('ArtistCatalogService', () => {
  const artistRepository = {
    findAndCount: jest.fn(),
    findOneByOrFail: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const discRepository = { query: jest.fn() };
  let service: ArtistCatalogService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        ArtistCatalogService,
        { provide: getRepositoryToken(Artist), useValue: artistRepository },
        { provide: getRepositoryToken(Disc), useValue: discRepository },
      ],
    }).compile();
    service = moduleRef.get(ArtistCatalogService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('uses default pagination and returns the current envelope without adding an order', async () => {
    const artists = [
      { id: 'artist-a', country: { id: 'country-a', name: 'A' } },
    ];
    artistRepository.findAndCount.mockResolvedValue([artists, 11]);

    await expect(service.findAll(new PaginationDto())).resolves.toEqual({
      totalItems: 11,
      totalPages: 2,
      currentPage: 1,
      limit: 10,
      data: artists,
    });
    expect(artistRepository.findAndCount).toHaveBeenCalledWith({
      take: 10,
      skip: 0,
    });
  });

  it('preserves supplied limit/offset arithmetic and empty pages', async () => {
    artistRepository.findAndCount.mockResolvedValue([[], 0]);
    const pagination = Object.assign(new PaginationDto(), {
      limit: 4,
      offset: 8,
    });
    await expect(service.findAll(pagination)).resolves.toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 3,
      limit: 4,
      data: [],
    });
    expect(artistRepository.findAndCount).toHaveBeenCalledWith({
      take: 4,
      skip: 8,
    });
  });

  it('returns the repository entity unchanged, including its eager Country relation', async () => {
    const artist = {
      id: 'artist-id',
      country: { id: 'country-id', name: 'Iceland' },
    };
    artistRepository.findOneByOrFail.mockResolvedValue(artist);

    await expect(service.findOne('artist-id')).resolves.toBe(artist);
    expect(artistRepository.findOneByOrFail).toHaveBeenCalledWith({
      id: 'artist-id',
    });
  });

  it('converts lookup failures to the established 404', async () => {
    artistRepository.findOneByOrFail.mockRejectedValue(
      new Error('database error'),
    );
    await expect(service.findOne('missing')).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'Artist with id missing not found',
    });
  });

  it('matches names exactly after Unicode, case and whitespace normalization in one batch', async () => {
    const candidates = [
      Object.assign(new Artist(), {
        id: 'artist-1',
        name: '  ＴＨＯＲＮＨＩＬＬ ',
      }),
    ];
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(candidates),
    };
    artistRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    discRepository.query.mockResolvedValue([
      {
        artistId: 'artist-1',
        id: 'disc-1',
        name: 'Heroine',
        image: null,
        releaseYear: null,
      },
      {
        artistId: 'artist-1',
        id: 'disc-1',
        name: 'Heroine',
        image: null,
        releaseYear: null,
      },
    ]);

    await expect(
      service.findExactNameMatches([' thornhill  ', 'Unknown']),
    ).resolves.toEqual([
      {
        catalogArtistId: 'artist-1',
        catalogDiscCount: 1,
        catalogDiscs: [
          { id: 'disc-1', name: 'Heroine', image: null, releaseYear: null },
        ],
      },
      { catalogArtistId: null, catalogDiscCount: 0, catalogDiscs: [] },
    ]);
    expect(artistRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      '(artist.search_name_normalized IN (:...searchKeys) OR (artist.search_name_normalized IS NULL AND artist.nameNormalized IN (:...legacySearchKeys)))',
      {
        searchKeys: [
          'thornhill',
          'the thornhill',
          'a thornhill',
          'an thornhill',
          'unknown',
          'the unknown',
          'a unknown',
          'an unknown',
        ],
        legacySearchKeys: [
          'thornhill',
          'the thornhill',
          'a thornhill',
          'an thornhill',
          'unknown',
          'the unknown',
          'a unknown',
          'an unknown',
        ],
      },
    );
    expect(discRepository.query).toHaveBeenCalledTimes(1);
    expect(discRepository.query.mock.calls[0][0]).toContain(
      'disc."releaseDate" DESC NULLS LAST',
    );
  });

  it('distinguishes new names from ambiguous identities and returns every candidate', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'artist-a', name: 'Twin' },
        { id: 'artist-b', name: 'TWIN' },
      ]),
    };
    artistRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.inspectExactNames(['Twin', 'Unknown', 'Twin']),
    ).resolves.toEqual([
      {
        status: 'ambiguous',
        code: 'ARTIST_AMBIGUOUS',
        candidates: [
          { id: 'artist-a', name: 'Twin' },
          { id: 'artist-b', name: 'TWIN' },
        ],
      },
      { status: 'new', candidates: [] },
      {
        status: 'ambiguous',
        code: 'ARTIST_AMBIGUOUS',
        candidates: [
          { id: 'artist-a', name: 'Twin' },
          { id: 'artist-b', name: 'TWIN' },
        ],
      },
    ]);
    expect(artistRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['MOL', 'MØL'],
    ['Solstafir', 'Sólstafir'],
    ['Motorhead', 'Motörhead'],
    ['Bjork', 'Björk'],
    ['Dodsrit', 'Dödsrit'],
    ['Secrets of Pandora', 'The Secrets of Pandora'],
  ])('uses normalized exact candidates for %s → %s', async (query, name) => {
    const candidate = Object.assign(new Artist(), {
      id: 'artist-1',
      name,
    });
    artistRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([candidate]),
    });
    discRepository.query.mockResolvedValue([]);

    await expect(service.findExactNameMatches([query])).resolves.toEqual([
      {
        catalogArtistId: 'artist-1',
        catalogDiscCount: 0,
        catalogDiscs: [],
      },
    ]);
  });

  it('does not link ambiguous names or fuzzy matches', async () => {
    const candidates = [
      Object.assign(new Artist(), { id: 'a-1', name: 'Greyhaven' }),
      Object.assign(new Artist(), { id: 'a-2', name: 'GREYHAVEN ' }),
      Object.assign(new Artist(), { id: 'a-3', name: 'Grey Haven' }),
    ];
    artistRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(candidates),
    });

    await expect(service.findExactNameMatches(['Greyhaven'])).resolves.toEqual([
      { catalogArtistId: null, catalogDiscCount: 0, catalogDiscs: [] },
    ]);
    expect(discRepository.query).not.toHaveBeenCalled();
  });

  it('resolves exact identities in one catalog query, preserves ambiguity as null, and does not read discs', async () => {
    const candidates = [
      Object.assign(new Artist(), { id: 'artist-1', name: 'Architects' }),
      Object.assign(new Artist(), { id: 'artist-2', name: 'Spiritbox' }),
      Object.assign(new Artist(), { id: 'artist-3', name: 'Twin' }),
      Object.assign(new Artist(), { id: 'artist-4', name: 'TWIN ' }),
    ];
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(candidates),
    };
    artistRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.resolveExactNames([
        ' architects ',
        'Spiritbox',
        'Missing',
        'ARCHITECTS',
        'Twin',
      ]),
    ).resolves.toEqual([
      { id: 'artist-1', name: 'Architects' },
      { id: 'artist-2', name: 'Spiritbox' },
      null,
      { id: 'artist-1', name: 'Architects' },
      null,
    ]);

    expect(artistRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.select).toHaveBeenCalledWith([
      'artist.id',
      'artist.name',
    ]);
    expect(queryBuilder.where).toHaveBeenCalledTimes(1);
    expect(discRepository.query).not.toHaveBeenCalled();
    expect(artistRepository.save).not.toHaveBeenCalled();
    expect(artistRepository.insert).not.toHaveBeenCalled();
    expect(artistRepository.update).not.toHaveBeenCalled();
    expect(artistRepository.delete).not.toHaveBeenCalled();
  });

  it('returns one null per input and skips the database for an empty batch', async () => {
    await expect(service.resolveExactNames([])).resolves.toEqual([]);
    expect(artistRepository.createQueryBuilder).not.toHaveBeenCalled();
    await expect(service.resolveExactNames(['   ', ''])).resolves.toEqual([
      null,
      null,
    ]);
    expect(artistRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
