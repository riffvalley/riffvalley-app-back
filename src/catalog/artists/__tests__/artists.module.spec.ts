import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from 'src/auth/entities/user.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { NationalRelease } from 'src/national-releases/entities/national-release.entity';
import { SpotifyPlaylistArtist } from 'src/festival-playlists/entities/spotify-playlist-artist.entity';
import { Artist } from '../entities/artist.entity';
import { ArtistCatalogService } from '../catalog/artist-catalog.service';
import { ArtistDetailsService } from '../details/artist-details.service';
import { ArtistManagementService } from '../management/artist-management.service';
import { ArtistOrphansService } from '../orphans/artist-orphans.service';
import { ArtistSearchService } from '../search/artist-search.service';
import { ArtistWriteService } from '../write/artist-write.service';
import { ArtistsController } from '../artists.controller';
import { ArtistsModule } from '../artists.module';
import { ArtistsService } from '../artists.service';

describe('ArtistsModule dependency injection', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const repositoryEntities = [
      Artist,
      Disc,
      NationalRelease,
      SpotifyPlaylistArtist,
      User,
      UserAccessLog,
      Rate,
    ];
    const testingModule = Test.createTestingModule({ imports: [ArtistsModule] })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'artists-module-test-secret') });

    for (const entity of repositoryEntities) {
      testingModule.overrideProvider(getRepositoryToken(entity)).useValue({});
    }
    moduleRef = await testingModule.compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('registers the controller, facade, and each responsibility service', () => {
    for (const provider of [
      ArtistsController,
      ArtistsService,
      ArtistCatalogService,
      ArtistWriteService,
      ArtistSearchService,
      ArtistDetailsService,
      ArtistManagementService,
      ArtistOrphansService,
    ]) {
      expect(moduleRef.get(provider)).toBeDefined();
    }
  });

  it('connects the facade and management/orphan responsibilities through Nest DI', () => {
    const facade = moduleRef.get(ArtistsService) as unknown as {
      artistCatalogService: ArtistCatalogService;
      artistWriteService: ArtistWriteService;
      artistSearchService: ArtistSearchService;
      artistDetailsService: ArtistDetailsService;
      artistManagementService: ArtistManagementService;
      artistOrphansService: ArtistOrphansService;
    };
    const management = moduleRef.get(ArtistManagementService) as unknown as {
      artistOrphansService: ArtistOrphansService;
    };
    const controller = moduleRef.get(ArtistsController) as unknown as {
      artistsService: ArtistsService;
    };

    expect(controller.artistsService).toBe(moduleRef.get(ArtistsService));
    expect(facade.artistCatalogService).toBe(moduleRef.get(ArtistCatalogService));
    expect(facade.artistWriteService).toBe(moduleRef.get(ArtistWriteService));
    expect(facade.artistSearchService).toBe(moduleRef.get(ArtistSearchService));
    expect(facade.artistDetailsService).toBe(moduleRef.get(ArtistDetailsService));
    expect(facade.artistManagementService).toBe(moduleRef.get(ArtistManagementService));
    expect(facade.artistOrphansService).toBe(moduleRef.get(ArtistOrphansService));
    expect(management.artistOrphansService).toBe(moduleRef.get(ArtistOrphansService));
  });
});
