import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeepPartial,
  FindOneOptions,
  FindOptionsWhere,
  SelectQueryBuilder,
} from 'typeorm';
import { MailService } from 'src/communications/mail/mail.service';
import { SpotifyAccountApiService } from '../spotify-account-api.service';
import { SpotifyConnection } from '../spotify-connection.entity';
import { SpotifyConnectionService } from '../spotify-connection.service';
import {
  SpotifyInvalidGrantError,
  SpotifyOAuthApiService,
} from '../spotify-oauth-api.service';
import { TokenCryptoService } from '../token-crypto.service';

type ConnectionQueryBuilder = Pick<
  SelectQueryBuilder<SpotifyConnection>,
  'addSelect' | 'where' | 'getOne'
>;

function createConnection(
  overrides: Partial<SpotifyConnection> = {},
): SpotifyConnection {
  return Object.assign(new SpotifyConnection(), {
    connectionKey: 'riff-valley',
    spotifyUserId: null,
    displayName: null,
    accessToken: null,
    refreshToken: null,
    scope: null,
    expiresAt: null,
    authorizedAt: null,
    refreshTokenExpiresAt: null,
    authorizationInvalidatedAt: null,
    reauthorizationReminderSentAt: null,
    oauthStateHash: null,
    oauthStateExpiresAt: null,
    ...overrides,
  });
}

function createQueryBuilder(
  connection: SpotifyConnection | null = null,
): jest.Mocked<ConnectionQueryBuilder> {
  return {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(connection),
  };
}

const grantedScopes =
  'playlist-modify-private playlist-modify-public ugc-image-upload user-read-private';

describe('SpotifyConnectionService', () => {
  let service: SpotifyConnectionService;
  let testingModule: TestingModule;
  let connectionRepository: {
    create: jest.Mock<SpotifyConnection, [DeepPartial<SpotifyConnection>]>;
    findOne: jest.Mock<
      Promise<SpotifyConnection | null>,
      [FindOneOptions<SpotifyConnection>]
    >;
    createQueryBuilder: jest.Mock<ConnectionQueryBuilder, [string]>;
    save: jest.Mock<Promise<SpotifyConnection>, [SpotifyConnection]>;
    delete: jest.Mock<
      Promise<{ affected?: number }>,
      [FindOptionsWhere<SpotifyConnection>]
    >;
  };
  let tokenCrypto: jest.Mocked<
    Pick<TokenCryptoService, 'hash' | 'encrypt' | 'decrypt'>
  >;
  let mailService: jest.Mocked<
    Pick<MailService, 'sendSpotifyReauthorizationReminder'>
  >;
  let spotifyOAuthApi: jest.Mocked<
    Pick<
      SpotifyOAuthApiService,
      'getAuthorizationUrl' | 'exchangeAuthorizationCode' | 'refreshAccessToken'
    >
  >;
  let spotifyAccountApi: jest.Mocked<
    Pick<SpotifyAccountApiService, 'getProfile'>
  >;

  beforeEach(async () => {
    connectionRepository = {
      create: jest.fn((value) => Object.assign(new SpotifyConnection(), value)),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      save: jest.fn(async (value) => value),
      delete: jest.fn(),
    };
    tokenCrypto = {
      hash: jest.fn((value: string) => `hash:${value}`),
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => `decrypted:${value}`),
    };
    mailService = { sendSpotifyReauthorizationReminder: jest.fn() };
    spotifyOAuthApi = {
      getAuthorizationUrl: jest.fn<
        ReturnType<SpotifyOAuthApiService['getAuthorizationUrl']>,
        Parameters<SpotifyOAuthApiService['getAuthorizationUrl']>
      >(() => 'https://accounts.spotify.test/authorize'),
      exchangeAuthorizationCode: jest.fn(),
      refreshAccessToken: jest.fn(),
    };
    spotifyAccountApi = { getProfile: jest.fn() };
    testingModule = await Test.createTestingModule({
      providers: [
        SpotifyConnectionService,
        {
          provide: getRepositoryToken(SpotifyConnection),
          useValue: connectionRepository,
        },
        { provide: TokenCryptoService, useValue: tokenCrypto },
        { provide: MailService, useValue: mailService },
        { provide: SpotifyOAuthApiService, useValue: spotifyOAuthApi },
        { provide: SpotifyAccountApiService, useValue: spotifyAccountApi },
      ],
    }).compile();
    service = testingModule.get(SpotifyConnectionService);
  });

  afterEach(async () => {
    await testingModule.close();
    jest.restoreAllMocks();
  });

  it('stores a hashed, ten-minute OAuth state and requests the existing scopes', async () => {
    const result = await service.startSpotifyConnection();
    const [scopes, state] = spotifyOAuthApi.getAuthorizationUrl.mock.calls[0];
    const savedConnection = connectionRepository.save.mock.calls[0][0];

    expect(state).toHaveLength(43);
    expect(savedConnection).toEqual(
      expect.objectContaining({
        connectionKey: 'riff-valley',
        oauthStateHash: `hash:${state}`,
        oauthStateExpiresAt: expect.any(Date),
      }),
    );
    expect(savedConnection.oauthStateExpiresAt.getTime()).toBeCloseTo(
      Date.now() + 10 * 60 * 1000,
      -3,
    );
    expect(scopes).toEqual([
      'playlist-modify-private',
      'playlist-modify-public',
      'ugc-image-upload',
      'user-read-private',
    ]);
    expect(result).toEqual({
      authorizationUrl: 'https://accounts.spotify.test/authorize',
    });
  });

  it('rejects missing, unknown, and expired OAuth state before token exchange', async () => {
    await expect(
      service.completeSpotifyConnection('', 'state'),
    ).rejects.toThrow(BadRequestException);

    const queryBuilder = createQueryBuilder();
    connectionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    await expect(
      service.completeSpotifyConnection('code', 'unknown-state'),
    ).rejects.toThrow('El estado OAuth no es válido o ha caducado');

    queryBuilder.getOne.mockResolvedValue(
      createConnection({
        oauthStateExpiresAt: new Date(Date.now() - 1),
      }),
    );
    await expect(
      service.completeSpotifyConnection('code', 'expired-state'),
    ).rejects.toThrow(BadRequestException);
    expect(spotifyOAuthApi.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('consumes a valid state before exchanging the code, even when exchange fails', async () => {
    const connection = createConnection({
      oauthStateHash: 'hash:state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
    });
    const queryBuilder = createQueryBuilder(connection);
    connectionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    spotifyOAuthApi.exchangeAuthorizationCode.mockRejectedValue(
      new Error('Spotify token exchange failed'),
    );

    await expect(
      service.completeSpotifyConnection('code', 'state'),
    ).rejects.toThrow('Spotify token exchange failed');

    expect(connection).toEqual(
      expect.objectContaining({
        oauthStateHash: null,
        oauthStateExpiresAt: null,
      }),
    );
    expect(connectionRepository.save).toHaveBeenCalledWith(connection);
    expect(spotifyAccountApi.getProfile).not.toHaveBeenCalled();
  });

  it('stores encrypted tokens, granted scopes, profile, and the six-month lifetime', async () => {
    const connection = createConnection({
      oauthStateHash: 'hash:state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
      refreshToken: 'encrypted:old-refresh',
      authorizationInvalidatedAt: new Date(),
      reauthorizationReminderSentAt: new Date(),
    });
    const queryBuilder = createQueryBuilder(connection);
    connectionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    spotifyOAuthApi.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });
    spotifyAccountApi.getProfile.mockResolvedValue({
      id: 'spotify-user',
      display_name: 'Riff Valley',
    });
    const before = Date.now();

    const result = await service.completeSpotifyConnection('code', 'state');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        spotifyUserId: 'spotify-user',
        displayName: 'Riff Valley',
        refreshTokenExpiresAt: expect.any(Date),
      }),
    );
    expect(connection).toEqual(
      expect.objectContaining({
        spotifyUserId: 'spotify-user',
        displayName: 'Riff Valley',
        accessToken: 'encrypted:access',
        refreshToken: 'encrypted:refresh',
        scope: grantedScopes,
        expiresAt: expect.any(Date),
        authorizedAt: expect.any(Date),
        authorizationInvalidatedAt: null,
        reauthorizationReminderSentAt: null,
      }),
    );
    expect(connection.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 3600 * 1000,
    );
    expect(connection.refreshTokenExpiresAt.getUTCMonth()).toBe(
      (connection.authorizedAt.getUTCMonth() + 6) % 12,
    );
    expect(connection.scope).toBe(grantedScopes);
    expect(connectionRepository.save).toHaveBeenCalledTimes(2);
  });

  it('preserves the existing status response and reports missing scopes', async () => {
    connectionRepository.findOne.mockResolvedValue(
      createConnection({
        spotifyUserId: 'spotify-user',
        displayName: 'Riff Valley',
        scope: 'playlist-modify-private user-read-private',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        authorizationInvalidatedAt: null,
        authorizedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );

    await expect(service.getSpotifyConnection()).resolves.toEqual({
      connected: true,
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      canUploadImages: false,
      missingScopes: ['playlist-modify-public', 'ugc-image-upload'],
      authorizationStatus: 'connected',
      reauthorizationRequired: false,
      reauthorizationReason: null,
      authorizedAt: new Date('2026-01-01T00:00:00Z'),
      refreshTokenExpiresAt: expect.any(Date),
      daysUntilReauthorization: expect.any(Number),
    });
  });

  it('refreshes an expiring access token and retains a refresh token omitted by Spotify', async () => {
    const connection = createConnection({
      accessToken: 'encrypted:old-access',
      refreshToken: 'encrypted:old-refresh',
      spotifyUserId: 'spotify-user',
      scope: grantedScopes,
      expiresAt: new Date(Date.now() + 30_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      authorizationInvalidatedAt: null,
    });
    const queryBuilder = createQueryBuilder(connection);
    connectionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    spotifyOAuthApi.refreshAccessToken.mockResolvedValue({
      access_token: 'new-access',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await expect(
      service.getValidAccessToken(['ugc-image-upload']),
    ).resolves.toBe('new-access');

    expect(spotifyOAuthApi.refreshAccessToken).toHaveBeenCalledWith(
      'decrypted:encrypted:old-refresh',
    );
    expect(connection).toEqual(
      expect.objectContaining({
        accessToken: 'encrypted:new-access',
        refreshToken: 'encrypted:old-refresh',
        scope: grantedScopes,
      }),
    );
    expect(connectionRepository.save).toHaveBeenCalledWith(connection);
  });

  it('rejects missing authorization or required scopes without refreshing', async () => {
    const queryBuilder = createQueryBuilder();
    connectionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    await expect(service.getValidAccessToken()).rejects.toThrow(
      'El usuario no ha conectado su cuenta de Spotify',
    );

    queryBuilder.getOne.mockResolvedValue(
      createConnection({
        accessToken: 'encrypted:access',
        refreshToken: 'encrypted:refresh',
        spotifyUserId: 'spotify-user',
        scope: 'playlist-modify-private',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        authorizationInvalidatedAt: null,
      }),
    );
    await expect(
      service.getValidAccessToken(['ugc-image-upload']),
    ).rejects.toThrow('Faltan permisos de Spotify (ugc-image-upload)');
    expect(spotifyOAuthApi.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('invalidates stored tokens after invalid_grant and preserves unrelated refresh errors', async () => {
    const connection = createConnection({
      accessToken: 'encrypted:access',
      refreshToken: 'encrypted:refresh',
      spotifyUserId: 'spotify-user',
      scope: grantedScopes,
      expiresAt: new Date(Date.now() - 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      authorizationInvalidatedAt: null,
    });
    const queryBuilder = createQueryBuilder(connection);
    connectionRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    spotifyOAuthApi.refreshAccessToken.mockRejectedValueOnce(
      new SpotifyInvalidGrantError('invalid_grant'),
    );

    await expect(service.getValidAccessToken()).rejects.toThrow(
      'Spotify ha invalidado la autorización',
    );
    expect(connection).toEqual(
      expect.objectContaining({
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        authorizationInvalidatedAt: expect.any(Date),
      }),
    );

    connection.authorizationInvalidatedAt = null;
    connection.accessToken = 'encrypted:access';
    connection.refreshToken = 'encrypted:refresh';
    connection.expiresAt = new Date(Date.now() - 1000);
    const refreshError = new Error('temporary refresh failure');
    spotifyOAuthApi.refreshAccessToken.mockRejectedValueOnce(refreshError);
    await expect(service.getValidAccessToken()).rejects.toBe(refreshError);
  });

  it('sends a single reauthorization reminder and disconnects the global account', async () => {
    const connection = createConnection({
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reauthorizationReminderSentAt: null,
    });
    connectionRepository.findOne.mockResolvedValue(connection);
    mailService.sendSpotifyReauthorizationReminder.mockResolvedValue(true);

    const checkLifetime = Reflect.get(
      service,
      'checkSpotifyAuthorizationLifetime',
    );
    expect(checkLifetime).toBeDefined();
    await checkLifetime.call(service);

    expect(mailService.sendSpotifyReauthorizationReminder).toHaveBeenCalledWith(
      'Riff Valley',
      connection.refreshTokenExpiresAt,
      7,
    );
    expect(connection.reauthorizationReminderSentAt).toBeInstanceOf(Date);
    expect(connectionRepository.save).toHaveBeenCalledWith(connection);

    await expect(service.disconnectSpotify()).resolves.toEqual({
      connected: false,
    });
    expect(connectionRepository.delete).toHaveBeenCalledWith({
      connectionKey: 'riff-valley',
    });
  });
});
