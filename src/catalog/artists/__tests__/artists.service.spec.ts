import { ArtistsService } from '../artists.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateArtistDto } from '../dto/create-artist.dto';
import { UpdateArtistDto } from '../dto/update-artist.dto';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ArtistCatalogService } from '../catalog/artist-catalog.service';
import { ArtistDetailsService } from '../details/artist-details.service';
import { ArtistManagementService } from '../management/artist-management.service';
import { ArtistOrphansService } from '../orphans/artist-orphans.service';
import { ArtistSearchService } from '../search/artist-search.service';
import { ArtistWriteService } from '../write/artist-write.service';
import { ArtistDirectoryService } from '../directory/artist-directory.service';

describe('ArtistsService facade', () => {
  const artistCatalogService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const artistWriteService = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const artistSearchService = { findByName: jest.fn() };
  const artistDetailsService = { findOneWithDetails: jest.fn() };
  const artistManagementService = { findAllForManagement: jest.fn() };
  const artistOrphansService = { removeOrphanArtists: jest.fn() };
  const artistDirectoryService = { findDirectory: jest.fn() };
  let service: ArtistsService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        ArtistsService,
        { provide: ArtistCatalogService, useValue: artistCatalogService },
        { provide: ArtistWriteService, useValue: artistWriteService },
        { provide: ArtistSearchService, useValue: artistSearchService },
        { provide: ArtistDetailsService, useValue: artistDetailsService },
        {
          provide: ArtistManagementService,
          useValue: artistManagementService,
        },
        { provide: ArtistOrphansService, useValue: artistOrphansService },
        { provide: ArtistDirectoryService, useValue: artistDirectoryService },
      ],
    }).compile();
    service = moduleRef.get(ArtistsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('delegates each public operation to its responsibility and returns results unchanged', async () => {
    const dto = Object.assign(new CreateArtistDto(), { name: 'Artist' });
    const pagination = Object.assign(new PaginationDto(), {
      limit: 5,
      offset: 10,
    });
    const directoryQuery = { letter: 'B', limit: 10, offset: 20 };
    const updateDto = Object.assign(new UpdateArtistDto(), { name: 'Updated' });
    const artistResponse = { id: 'artist-id' };
    const listResponse = { data: [artistResponse] };
    const directoryResponse = { data: [artistResponse] };
    const managementResponse = { data: [artistResponse], orphanCount: 0 };
    const searchResponse = [artistResponse];
    const detailsResponse = {
      ...artistResponse,
      discs: [],
      nationalReleases: [],
    };
    const orphanResponse = { deleted: 0, artists: [] };
    const deleteResult = { affected: 1 };

    artistWriteService.create.mockResolvedValue(artistResponse);
    artistCatalogService.findAll.mockResolvedValue(listResponse);
    artistDirectoryService.findDirectory.mockResolvedValue(directoryResponse);
    artistManagementService.findAllForManagement.mockResolvedValue(
      managementResponse,
    );
    artistCatalogService.findOne.mockResolvedValue(artistResponse);
    artistDetailsService.findOneWithDetails.mockResolvedValue(detailsResponse);
    artistSearchService.findByName.mockResolvedValue(searchResponse);
    artistWriteService.update.mockResolvedValue(artistResponse);
    artistOrphansService.removeOrphanArtists.mockResolvedValue(orphanResponse);
    artistWriteService.remove.mockResolvedValue(deleteResult);

    await expect(service.create(dto)).resolves.toBe(artistResponse);
    await expect(service.findAll(pagination)).resolves.toBe(listResponse);
    await expect(service.findDirectory(directoryQuery)).resolves.toBe(
      directoryResponse,
    );
    await expect(
      service.findAllForManagement('name', 15, 3, 'genre-id', true),
    ).resolves.toBe(managementResponse);
    await expect(service.findOne('artist-id')).resolves.toBe(artistResponse);
    await expect(service.findOneWithDetails('artist-id')).resolves.toBe(
      detailsResponse,
    );
    await expect(service.findByName('artist')).resolves.toBe(searchResponse);
    await expect(service.update('artist-id', updateDto)).resolves.toBe(
      artistResponse,
    );
    await expect(service.removeOrphanArtists()).resolves.toBe(orphanResponse);
    await expect(service.remove('artist-id')).resolves.toBe(deleteResult);

    expect(artistWriteService.create).toHaveBeenCalledWith(dto);
    expect(artistCatalogService.findAll).toHaveBeenCalledWith(pagination);
    expect(artistDirectoryService.findDirectory).toHaveBeenCalledWith(
      directoryQuery,
    );
    expect(artistManagementService.findAllForManagement).toHaveBeenCalledWith(
      'name',
      15,
      3,
      'genre-id',
      true,
    );
    expect(artistCatalogService.findOne).toHaveBeenCalledWith('artist-id');
    expect(artistDetailsService.findOneWithDetails).toHaveBeenCalledWith(
      'artist-id',
    );
    expect(artistSearchService.findByName).toHaveBeenCalledWith('artist');
    expect(artistWriteService.update).toHaveBeenCalledWith(
      'artist-id',
      updateDto,
    );
    expect(artistOrphansService.removeOrphanArtists).toHaveBeenCalledWith();
    expect(artistWriteService.remove).toHaveBeenCalledWith('artist-id');
  });
});
