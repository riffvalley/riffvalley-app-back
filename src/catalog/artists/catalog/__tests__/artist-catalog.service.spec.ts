import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from '../../entities/artist.entity';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ArtistCatalogService } from '../artist-catalog.service';

describe('ArtistCatalogService', () => {
  const artistRepository = {
    findAndCount: jest.fn(),
    findOneByOrFail: jest.fn(),
  };
  let service: ArtistCatalogService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        ArtistCatalogService,
        { provide: getRepositoryToken(Artist), useValue: artistRepository },
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
});
