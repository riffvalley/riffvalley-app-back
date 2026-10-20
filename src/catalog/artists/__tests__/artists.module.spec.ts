import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from 'src/identity/auth/entities/user.entity';
import { UserAccessLog } from 'src/identity/auth/entities/user-access-log.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { NationalRelease } from 'src/editorial/national-releases/entities/national-release.entity';
import { RiffValleyPlaylistArtist } from 'src/editorial/playlists/spotify-playlists/entities/riff-valley-playlist-artist.entity';
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
      RiffValleyPlaylistArtist,
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
    const facade = moduleRef.get(ArtistsService);
    const management = moduleRef.get(ArtistManagementService);
    const controller = moduleRef.get(ArtistsController);

    expect(Reflect.get(controller, 'artistsService')).toBe(facade);
    expect(Reflect.get(facade, 'artistCatalogService')).toBe(
      moduleRef.get(ArtistCatalogService),
    );
    expect(Reflect.get(facade, 'artistWriteService')).toBe(
      moduleRef.get(ArtistWriteService),
    );
    expect(Reflect.get(facade, 'artistSearchService')).toBe(
      moduleRef.get(ArtistSearchService),
    );
    expect(Reflect.get(facade, 'artistDetailsService')).toBe(
      moduleRef.get(ArtistDetailsService),
    );
    expect(Reflect.get(facade, 'artistManagementService')).toBe(
      moduleRef.get(ArtistManagementService),
    );
    expect(Reflect.get(facade, 'artistOrphansService')).toBe(
      moduleRef.get(ArtistOrphansService),
    );
    expect(Reflect.get(management, 'artistOrphansService')).toBe(
      moduleRef.get(ArtistOrphansService),
    );
  });
});
