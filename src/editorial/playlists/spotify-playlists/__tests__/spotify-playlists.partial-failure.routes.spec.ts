import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { User } from 'src/identity/auth/entities/user.entity';
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

describe('FestivalPlaylists partial failure HTTP responses', () => {
  const secret = 'festival-playlists-partial-failure-test-secret';
  const testUser = {
    id: '83f59390-5ca1-4331-90c2-3b54ca17e123',
    username: 'riff-valley-test',
    isActive: true,
    role: ValidRoles.riffvalley,
  };
  let app: any;
  let moduleRef: TestingModule;
  let accessToken: string;
  let service: SpotifyPlaylistsService;
  let playlistRepository: any;
  let spotifyAccountApi: any;
  let playlistManagementService: SpotifyPlaylistManagementService;
  let playlistTrackMaintenanceService: SpotifyPlaylistTrackMaintenanceService;
  let spotifyAuthorizationService: any;
  const userRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    playlistRepository = {
      create: jest.fn((value) => ({ id: 'playlist-local', ...value })),
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
      checkSpotifyAuthorizationLifetime: jest.fn(),
      disconnectSpotify: jest.fn(),
      getValidAccessToken: jest.fn().mockResolvedValue('token'),
    };
    playlistManagementService = new SpotifyPlaylistManagementService(
      playlistRepository,
      spotifyAccountApi,
      spotifyAuthorizationService,
    );
    playlistTrackMaintenanceService =
      new SpotifyPlaylistTrackMaintenanceService(
        playlistRepository,
        playlistRepository,
        spotifyAccountApi,
        spotifyAuthorizationService,
        playlistManagementService,
      );
    service = new SpotifyPlaylistsService(
      spotifyAuthorizationService,
      {} as any,
      playlistManagementService,
      {} as any,
      playlistTrackMaintenanceService,
    );

    userRepository.findOneBy.mockResolvedValue(testUser);
    userRepository.findOne.mockResolvedValue({ role: testUser.role });
    moduleRef = await Test.createTestingModule({
      controllers: [FestivalPlaylistsController, GenrePlaylistsController],
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      providers: [
        { provide: SpotifyPlaylistsService, useValue: service },
        { provide: getRepositoryToken(User), useValue: userRepository },
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
      .mockResolvedValue({
        id: '7eb145c8-16b0-44f9-b921-dba85fb1e51c',
        spotifyPlaylistId: 'playlist-remote',
      } as any);
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
    const linkedGenrePlaylist = Object.assign(new RiffValleyPlaylist(), {
      id: '7eb145c8-16b0-44f9-b921-dba85fb1e51c',
      spotifyPlaylistId: 'playlist-remote',
      type: 'genero',
    });
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
