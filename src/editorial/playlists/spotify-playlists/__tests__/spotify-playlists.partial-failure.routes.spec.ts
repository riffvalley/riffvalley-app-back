import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DeepPartial, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { User } from 'src/identity/auth/entities/user.entity';
import { UsersService } from 'src/identity/users/users.service';
import { JwtStrategy } from 'src/identity/auth/strategies/jwt.strategy';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { FestivalPlaylistsController } from '../festival-playlists.controller';
import { GenrePlaylistsController } from '../genre-playlists.controller';
import { SpotifyPlaylistsService } from '../spotify-playlists.service';
import { BadGatewayException } from '@nestjs/common';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';
import { SpotifyPlaylistTrackMaintenanceService } from '../track-maintenance/spotify-playlist-track-maintenance.service';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import {
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { RiffValleyPlaylistArtist } from '../entities/riff-valley-playlist-artist.entity';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration/api';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from '../setlist/festival-setlist.service';
import { SpotifyPlaylistArtistSyncService } from '../artist-sync/spotify-playlist-artist-sync.service';

type PlaylistRepository = jest.Mocked<
  Pick<Repository<RiffValleyPlaylist>, 'findOne' | 'update'>
> & {
  create: jest.Mock<RiffValleyPlaylist, [DeepPartial<RiffValleyPlaylist>]>;
  save: jest.Mock<
    Promise<RiffValleyPlaylist>,
    [DeepPartial<RiffValleyPlaylist>]
  >;
};
type SpotifyAccountApi = jest.Mocked<
  Pick<
    SpotifyAccountApiService,
    'createPlaylist' | 'removePlaylistFromLibrary' | 'updatePlaylist'
  >
>;
type SpotifyAuthorization = jest.Mocked<
  Pick<
    SpotifyPlaylistAuthorizationService,
    | 'startSpotifyConnection'
    | 'completeSpotifyConnection'
    | 'getSpotifyConnection'
    | 'disconnectSpotify'
    | 'getValidAccessToken'
  >
>;

const playlistFixture = (
  type = RiffValleyPlaylistType.FESTIVAL,
): RiffValleyPlaylist =>
  Object.assign(new RiffValleyPlaylist(), {
    id: '7eb145c8-16b0-44f9-b921-dba85fb1e51c',
    name: 'Playlist',
    status: RiffValleyPlaylistStatus.IN_PROGRESS,
    link: 'https://open.spotify.com/playlist/playlist-remote',
    spotifyPlaylistId: 'playlist-remote',
    description: null,
    isPublic: false,
    imageUrl: null,
    protectedTrackUris: [],
    type,
    updateDate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    user: null,
    content: null,
    playlistArtists: [],
  });

describe('FestivalPlaylists partial failure HTTP responses', () => {
  const secret = 'festival-playlists-partial-failure-test-secret';
  const testUser = Object.assign(new User(), {
    id: '83f59390-5ca1-4331-90c2-3b54ca17e123',
    username: 'riff-valley-test',
    isActive: true,
    role: ValidRoles.riffvalley,
    email: 'test@example.test',
    password: 'test',
    image: null,
    dashboardConfig: null,
    mobileDashboardConfig: null,
    dashboardButtonsEnabled: false,
    createdAt: new Date(0),
    notes: null,
    lastLogin: null,
    rate: null,
    favorite: null,
    pending: null,
    comments: [],
    asignations: [],
    riffValleyPlaylists: [],
    articles: [],
    videos: [],
    requests: [],
  });
  let app: INestApplication;
  let moduleRef: TestingModule;
  let accessToken: string;
  let playlistRepository: PlaylistRepository;
  let spotifyAccountApi: SpotifyAccountApi;
  let playlistManagementService: SpotifyPlaylistManagementService;
  let spotifyAuthorizationService: SpotifyAuthorization;
  const usersService = {
    findById: jest.fn(),
    findIdentityById: jest.fn(),
  };

  let artistRepository: jest.Mocked<Pick<Repository<Artist>, 'findOneBy'>>;
  let playlistArtistRepository: jest.Mocked<
    Pick<
      Repository<RiffValleyPlaylistArtist>,
      'find' | 'findOne' | 'save' | 'create' | 'delete' | 'remove'
    >
  >;
  let setlistService: jest.Mocked<Pick<FestivalSetlistService, 'getTopSongs'>>;

  beforeEach(async () => {
    playlistRepository = {
      create: jest.fn((value: DeepPartial<RiffValleyPlaylist>) =>
        Object.assign(new RiffValleyPlaylist(), {
          id: 'playlist-local',
          ...value,
        }),
      ),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    spotifyAccountApi = {
      createPlaylist: jest.fn(),
      removePlaylistFromLibrary: jest.fn(),
      updatePlaylist: jest.fn(),
    };
    spotifyAuthorizationService = {
      startSpotifyConnection: jest.fn(),
      completeSpotifyConnection: jest.fn(),
      getSpotifyConnection: jest.fn(),
      disconnectSpotify: jest.fn(),
      getValidAccessToken: jest.fn().mockResolvedValue('token'),
    };
    artistRepository = { findOneBy: jest.fn() };
    playlistArtistRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    setlistService = { getTopSongs: jest.fn() };

    usersService.findById.mockResolvedValue(testUser);
    usersService.findIdentityById.mockResolvedValue({
      id: testUser.id,
      role: testUser.role,
      isActive: true,
    });
    moduleRef = await Test.createTestingModule({
      controllers: [FestivalPlaylistsController, GenrePlaylistsController],
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      providers: [
        SpotifyPlaylistsService,
        SpotifyPlaylistManagementService,
        SpotifyPlaylistTrackMaintenanceService,
        SpotifyPlaylistArtistSyncService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: playlistRepository,
        },
        {
          provide: getRepositoryToken(RiffValleyPlaylistArtist),
          useValue: playlistArtistRepository,
        },
        { provide: getRepositoryToken(Artist), useValue: artistRepository },
        { provide: SpotifyAccountApiService, useValue: spotifyAccountApi },
        {
          provide: SpotifyPlaylistAuthorizationService,
          useValue: spotifyAuthorizationService,
        },
        { provide: FestivalSetlistService, useValue: setlistService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: { get: () => secret } },
        JwtStrategy,
        UserRoleGuard,
      ],
    }).compile();
    accessToken = await moduleRef.get(JwtService).signAsync({
      id: testUser.id,
      username: testUser.username,
      role: testUser.role,
    });
    playlistManagementService = moduleRef.get(SpotifyPlaylistManagementService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 500 after Spotify creates the playlist but the local insert fails', async () => {
    spotifyAccountApi.createPlaylist.mockResolvedValue({
      id: 'playlist-remote',
      name: 'Festival',
      external_urls: { spotify: 'https://open.spotify.com/playlist/remote' },
    });
    playlistRepository.save.mockRejectedValue(new Error('local insert failed'));
    playlistRepository.findOne.mockResolvedValue(null);
    spotifyAccountApi.removePlaylistFromLibrary.mockRejectedValue(
      new BadGatewayException('library removal failed'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/festival-playlists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Festival', public: false })
      .expect(500);

    expect(response.body.message).toContain(
      'https://open.spotify.com/playlist/remote',
    );
    expect(spotifyAccountApi.createPlaylist).toHaveBeenCalledTimes(1);
    expect(spotifyAccountApi.removePlaylistFromLibrary).toHaveBeenCalledWith(
      'token',
      'playlist-remote',
    );
    expect(playlistRepository.save).toHaveBeenCalledTimes(1);
  });

  it('returns Spotify 502 and skips the local update when remote metadata update fails', async () => {
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlistFixture());
    spotifyAccountApi.updatePlaylist.mockRejectedValue(
      new BadGatewayException('Spotify update failed'),
    );

    await request(app.getHttpServer())
      .patch('/api/festival-playlists/7eb145c8-16b0-44f9-b921-dba85fb1e51c')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated' })
      .expect(502);

    expect(spotifyAccountApi.updatePlaylist).toHaveBeenCalledTimes(1);
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('returns Spotify 502 for genre rename failures without updating the local row', async () => {
    const linkedGenrePlaylist = playlistFixture(RiffValleyPlaylistType.GENERO);
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(linkedGenrePlaylist);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(linkedGenrePlaylist);
    spotifyAccountApi.updatePlaylist.mockRejectedValue(
      new BadGatewayException('Spotify update failed'),
    );

    await request(app.getHttpServer())
      .patch('/api/genre-playlists/7eb145c8-16b0-44f9-b921-dba85fb1e51c')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated' })
      .expect(502);

    expect(spotifyAccountApi.updatePlaylist).toHaveBeenCalledWith(
      'token',
      'playlist-remote',
      { name: 'Updated' },
    );
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });
});
