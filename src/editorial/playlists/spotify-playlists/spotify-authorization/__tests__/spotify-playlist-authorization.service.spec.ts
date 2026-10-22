import { Test, TestingModule } from '@nestjs/testing';
import { SpotifyConnectionService } from 'src/integrations/spotify-integration/oauth/spotify-connection.service';
import { SpotifyPlaylistAuthorizationService } from '../spotify-playlist-authorization.service';

describe('SpotifyPlaylistAuthorizationService', () => {
  let service: SpotifyPlaylistAuthorizationService;
  let moduleRef: TestingModule;
  let spotifyConnection: jest.Mocked<
    Pick<
      SpotifyConnectionService,
      | 'startSpotifyConnection'
      | 'completeSpotifyConnection'
      | 'getSpotifyConnection'
      | 'disconnectSpotify'
      | 'getValidAccessToken'
    >
  >;

  beforeEach(async () => {
    spotifyConnection = {
      startSpotifyConnection: jest.fn(),
      completeSpotifyConnection: jest.fn(),
      getSpotifyConnection: jest.fn(),
      disconnectSpotify: jest.fn(),
      getValidAccessToken: jest.fn(),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        SpotifyPlaylistAuthorizationService,
        { provide: SpotifyConnectionService, useValue: spotifyConnection },
      ],
    }).compile();
    service = moduleRef.get(SpotifyPlaylistAuthorizationService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('delegates connection operations and token requests without changing results', async () => {
    const authorization = { authorizationUrl: 'https://spotify.test/auth' };
    const connection = {
      connected: true,
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      canUploadImages: true,
      missingScopes: [],
      authorizationStatus: 'connected' as const,
      reauthorizationRequired: false,
      reauthorizationReason: null,
      authorizedAt: new Date('2026-01-01T00:00:00.000Z'),
      refreshTokenExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
      daysUntilReauthorization: 90,
    };
    const completed = {
      connected: true,
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      refreshTokenExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    };
    spotifyConnection.startSpotifyConnection.mockResolvedValue(authorization);
    spotifyConnection.completeSpotifyConnection.mockResolvedValue(completed);
    spotifyConnection.getSpotifyConnection.mockResolvedValue(connection);
    spotifyConnection.disconnectSpotify.mockResolvedValue({ connected: false });
    spotifyConnection.getValidAccessToken.mockResolvedValue('access-token');

    await expect(service.startSpotifyConnection()).resolves.toBe(authorization);
    await expect(
      service.completeSpotifyConnection('code', 'state'),
    ).resolves.toBe(completed);
    await expect(service.getSpotifyConnection()).resolves.toBe(connection);
    await expect(service.disconnectSpotify()).resolves.toEqual({
      connected: false,
    });
    await expect(
      service.getValidAccessToken(['ugc-image-upload']),
    ).resolves.toBe('access-token');

    expect(spotifyConnection.startSpotifyConnection).toHaveBeenCalledTimes(1);
    expect(spotifyConnection.completeSpotifyConnection).toHaveBeenCalledWith(
      'code',
      'state',
    );
    expect(spotifyConnection.getSpotifyConnection).toHaveBeenCalledTimes(1);
    expect(spotifyConnection.disconnectSpotify).toHaveBeenCalledTimes(1);
    expect(spotifyConnection.getValidAccessToken).toHaveBeenCalledWith([
      'ugc-image-upload',
    ]);
  });

  it('propagates OAuth errors unchanged through the feature facade', async () => {
    const error = new Error('Spotify OAuth failed');
    spotifyConnection.completeSpotifyConnection.mockRejectedValue(error);

    await expect(
      service.completeSpotifyConnection('code', 'state'),
    ).rejects.toBe(error);
  });
});
