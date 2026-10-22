import {
  BadGatewayException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TiktokApiService } from '../api/tiktok-api.service';
import { TiktokConnectionService } from '../oauth/tiktok-connection.service';
import { TiktokTokenCryptoService } from '../oauth/token-crypto.service';
import { TiktokService } from '../tiktok.service';
import { TiktokVideosService } from '../videos/tiktok-videos.service';
import { TiktokConnection } from '../oauth/tiktok-connection.entity';
import { TiktokVideo } from '../entities/tiktok-video.entity';
import { MailService } from 'src/communications/mail/mail.service';

describe('TiktokService facade integration', () => {
  const originalFetch = global.fetch;
  const config = {
    TIKTOK_CLIENT_KEY: 'test-client-key',
    TIKTOK_CLIENT_SECRET: 'test-client-secret',
    TIKTOK_REDIRECT_URI: 'https://api.test/api/tiktok/callback',
  };
  let service: TiktokService;
  let connectionRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let videoRepository: {
    upsert: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
  };
  let tokenCrypto: {
    hash: jest.Mock;
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };
  let tiktokApi: TiktokApiService;
  let tiktokConnection: TiktokConnectionService;
  let tiktokVideos: TiktokVideosService;
  let mailService: { sendTiktokReauthorizationReminder: jest.Mock };
  let configService: ConfigService;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let moduleRef: TestingModule;

  const createQueryBuilder = (connection: unknown) => {
    const builder: {
      addSelect: jest.Mock;
      where: jest.Mock;
      getOne: jest.Mock;
    } = {
      addSelect: jest.fn(),
      where: jest.fn(),
      getOne: jest.fn().mockResolvedValue(connection),
    };
    builder.addSelect.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    return builder;
  };

  const providerResponse = (
    body: unknown,
    ok = true,
    status = ok ? 200 : 400,
  ): Response => new Response(JSON.stringify(body), { status });

  beforeEach(async () => {
    connectionRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => value),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    videoRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
    };
    tokenCrypto = {
      hash: jest.fn((value: string) => `hash:${value}`),
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    };
    mailService = {
      sendTiktokReauthorizationReminder: jest.fn(),
    };
    configService = new ConfigService();
    for (const [key, value] of Object.entries(config)) {
      configService.set(key, value);
    }
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    moduleRef = await Test.createTestingModule({
      providers: [
        TiktokService,
        TiktokApiService,
        TiktokConnectionService,
        TiktokVideosService,
        {
          provide: getRepositoryToken(TiktokConnection),
          useValue: connectionRepository,
        },
        {
          provide: getRepositoryToken(TiktokVideo),
          useValue: videoRepository,
        },
        { provide: ConfigService, useValue: configService },
        { provide: TiktokTokenCryptoService, useValue: tokenCrypto },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(TiktokService);
    tiktokApi = moduleRef.get(TiktokApiService);
    tiktokVideos = moduleRef.get(TiktokVideosService);
    tiktokConnection = moduleRef.get(TiktokConnectionService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    return moduleRef.close();
  });

  it('creates a one-time OAuth state and provider authorization URL', async () => {
    connectionRepository.findOne.mockResolvedValue(null);

    const result = await service.startConnection();
    const authorizationUrl = new URL(result.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      'https://www.tiktok.com/v2/auth/authorize/',
    );
    expect(authorizationUrl.searchParams.get('client_key')).toBe(
      'test-client-key',
    );
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      config.TIKTOK_REDIRECT_URI,
    );
    expect(authorizationUrl.searchParams.get('scope')).toBe(
      'user.info.basic,video.list',
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(connectionRepository.create).toHaveBeenCalledWith({
      connectionKey: 'riff-valley',
    });
    expect(connectionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        oauthStateHash: `hash:${state}`,
        oauthStateExpiresAt: expect.any(Date),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges OAuth code, fetches the profile and stores encrypted tokens', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      oauthStateHash: 'hash:valid-state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    fetchMock
      .mockResolvedValueOnce(
        providerResponse({
          access_token: 'access-token',
          expires_in: 86400,
          open_id: 'provider-open-id',
          refresh_token: 'refresh-token',
          refresh_expires_in: 31536000,
          scope: 'user.info.basic,video.list',
          token_type: 'Bearer',
        }),
      )
      .mockResolvedValueOnce(
        providerResponse({
          data: {
            user: { open_id: 'provider-open-id', display_name: 'Riff Valley' },
          },
          error: { code: 'ok', message: '', log_id: '' },
        }),
      );

    await expect(
      service.completeConnection('auth-code', 'valid-state'),
    ).resolves.toMatchObject({
      connected: true,
      openId: 'provider-open-id',
      displayName: 'Riff Valley',
      refreshTokenExpiresAt: expect.any(Date),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://open.tiktokapis.com/v2/oauth/token/',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: expect.any(URLSearchParams),
      }),
    );
    const tokenRequest = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(Object.fromEntries(tokenRequest.entries())).toEqual({
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: config.TIKTOK_REDIRECT_URI,
      client_key: config.TIKTOK_CLIENT_KEY,
      client_secret: config.TIKTOK_CLIENT_SECRET,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
      { headers: { Authorization: 'Bearer access-token' } },
    );
    expect(connectionRepository.save).toHaveBeenCalledTimes(2);
    expect(connection).toMatchObject({
      oauthStateHash: null,
      oauthStateExpiresAt: null,
      accessToken: 'encrypted:access-token',
      refreshToken: 'encrypted:refresh-token',
      openId: 'provider-open-id',
      displayName: 'Riff Valley',
      scope: 'user.info.basic,video.list',
      authorizationInvalidatedAt: null,
      reauthorizationReminderSentAt: null,
    });
  });

  it('translates OAuth provider errors and consumes state before the exchange', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      oauthStateHash: 'hash:valid-state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    fetchMock.mockResolvedValue(
      providerResponse(
        { error: 'server_error', error_description: 'Try later' },
        false,
        503,
      ),
    );

    await expect(
      service.completeConnection('auth-code', 'valid-state'),
    ).rejects.toThrow(
      new BadGatewayException('TikTok OAuth respondió con 503: Try later'),
    );
    expect(connection.oauthStateHash).toBeNull();
    expect(connection.oauthStateExpiresAt).toBeNull();
    expect(connectionRepository.save).toHaveBeenCalledTimes(1);
  });

  it('syncs paginated video responses with the current bearer token', async () => {
    const connection = {
      openId: 'provider-open-id',
      accessToken: 'encrypted:access-token',
      refreshToken: 'encrypted:refresh-token',
      expiresAt: new Date(Date.now() + 5 * 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      scope: 'user.info.basic video.list',
    };
    const builder = createQueryBuilder(connection);
    connectionRepository.createQueryBuilder.mockReturnValue(builder);
    fetchMock
      .mockResolvedValueOnce(
        providerResponse({
          data: {
            videos: [
              {
                id: 'video-1',
                title: 'First',
                video_description: 'Description',
                cover_image_url: 'https://cdn.test/cover.jpg',
                share_url: 'https://www.tiktok.com/@riffvalley/video/video-1',
                duration: 50,
                view_count: 100,
                create_time: 1_700_000_000,
              },
            ],
            cursor: 123,
            has_more: true,
          },
          error: { code: 'ok', message: '', log_id: '' },
        }),
      )
      .mockResolvedValueOnce(
        providerResponse({
          data: { videos: [{ id: 'video-2' }], cursor: 456, has_more: false },
          error: { code: 'ok', message: '', log_id: '' },
        }),
      );

    await service.syncVideos();

    expect(builder.addSelect).toHaveBeenCalledWith([
      'connection.accessToken',
      'connection.refreshToken',
    ]);
    expect(tokenCrypto.decrypt).toHaveBeenCalledWith('encrypted:access-token');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /^https:\/\/open\.tiktokapis\.com\/v2\/video\/list\/\?fields=/,
      ),
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20, cursor: undefined }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ max_count: 20, cursor: 123 }),
      }),
    );
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tiktokVideoId: 'video-1',
        title: 'First',
        videoDescription: 'Description',
        coverImageUrl: 'https://cdn.test/cover.jpg',
        permalink: 'https://www.tiktok.com/@riffvalley/video/video-1',
        duration: 50,
        viewCount: 100,
        tiktokCreateTime: new Date(1_700_000_000 * 1000),
      }),
      ['tiktokVideoId'],
    );
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tiktokVideoId: 'video-2',
        videoDescription: null,
        shareCount: null,
      }),
      ['tiktokVideoId'],
    );
  });

  it('refreshes expiring access tokens and persists TikTok token rotation', async () => {
    const connection = {
      openId: 'provider-open-id',
      accessToken: 'encrypted:old-access-token',
      refreshToken: 'encrypted:old-refresh-token',
      expiresAt: new Date(Date.now() + 10_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      scope: 'user.info.basic video.list',
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    fetchMock
      .mockResolvedValueOnce(
        providerResponse({
          access_token: 'rotated-access-token',
          expires_in: 3600,
          refresh_token: 'rotated-refresh-token',
          refresh_expires_in: 31536000,
          scope: 'user.info.basic,video.list',
        }),
      )
      .mockResolvedValueOnce(
        providerResponse({
          data: { videos: [], has_more: false },
          error: { code: 'ok', message: '', log_id: '' },
        }),
      );

    await service.syncVideos();

    const tokenRequest = fetchMock.mock.calls[0][1];
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://open.tiktokapis.com/v2/oauth/token/',
    );
    const tokenRequestBody = tokenRequest.body;
    if (!(tokenRequestBody instanceof URLSearchParams)) {
      throw new Error('TikTok token request body must be URL-encoded');
    }
    expect(Object.fromEntries(tokenRequestBody.entries())).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh-token',
      client_key: config.TIKTOK_CLIENT_KEY,
      client_secret: config.TIKTOK_CLIENT_SECRET,
    });
    expect(connection).toMatchObject({
      accessToken: 'encrypted:rotated-access-token',
      refreshToken: 'encrypted:rotated-refresh-token',
      scope: 'user.info.basic,video.list',
    });
    expect(connection).not.toHaveProperty('authorizationInvalidatedAt');
    expect(connectionRepository.save).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer rotated-access-token',
        }),
      }),
    );
  });

  it('invalidates stored tokens after TikTok returns invalid_grant', async () => {
    const connection = {
      openId: 'provider-open-id',
      accessToken: 'encrypted:old-access-token',
      refreshToken: 'encrypted:old-refresh-token',
      expiresAt: new Date(Date.now() - 1_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      scope: 'user.info.basic video.list',
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    fetchMock.mockResolvedValue(
      providerResponse(
        { error: 'invalid_grant', error_description: 'Refresh token expired' },
        false,
        400,
      ),
    );

    await service.syncVideos();

    expect(connection).toMatchObject({
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      authorizationInvalidatedAt: expect.any(Date),
    });
    expect(connectionRepository.save).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(videoRepository.upsert).not.toHaveBeenCalled();
  });

  it('does not persist rows when TikTok reports a video-list API error', async () => {
    const connection = {
      openId: 'provider-open-id',
      accessToken: 'encrypted:access-token',
      refreshToken: 'encrypted:refresh-token',
      expiresAt: new Date(Date.now() + 5 * 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      scope: 'user.info.basic video.list',
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    fetchMock.mockResolvedValue(
      providerResponse({
        error: {
          code: 'scope_not_authorized',
          message: 'Missing scope',
          log_id: 'log',
        },
      }),
    );

    await service.syncVideos();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(videoRepository.upsert).not.toHaveBeenCalled();
  });

  it('maps repository list/detail responses to the existing public contracts', async () => {
    const row = {
      id: 'internal-uuid',
      tiktokVideoId: 'public-video-id',
      title: 'Title',
      videoDescription: 'Description',
      coverImageUrl: 'https://cdn.test/cover.jpg',
      permalink: 'https://www.tiktok.com/video/public-video-id',
      embedLink: 'https://www.tiktok.com/player/public-video-id',
      embedHtml: '<blockquote>embed</blockquote>',
      duration: 23,
      viewCount: 10,
      likeCount: 2,
      commentCount: 1,
      shareCount: 0,
      tiktokCreateTime: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-02T00:00:00Z'),
      updatedAt: new Date('2026-10-03T00:00:00Z'),
    };
    videoRepository.findAndCount.mockResolvedValue([[row], 2]);
    videoRepository.findOne.mockResolvedValue(row);

    await expect(service.findVideos({ limit: 1, offset: 1 })).resolves.toEqual({
      data: [
        {
          id: 'public-video-id',
          title: 'Title',
          coverImageUrl: 'https://cdn.test/cover.jpg',
          permalink: 'https://www.tiktok.com/video/public-video-id',
          embedLink: 'https://www.tiktok.com/player/public-video-id',
          duration: 23,
          viewCount: 10,
          likeCount: 2,
          commentCount: 1,
          shareCount: 0,
          createTime: row.tiktokCreateTime,
        },
      ],
      totalItems: 2,
      hasMore: false,
    });
    expect(videoRepository.findAndCount).toHaveBeenCalledWith({
      order: { tiktokCreateTime: 'DESC' },
      take: 1,
      skip: 1,
    });

    await expect(
      service.findVideoDetail('public-video-id'),
    ).resolves.toMatchObject({
      id: 'public-video-id',
      videoDescription: 'Description',
      embedHtml: '<blockquote>embed</blockquote>',
    });
    expect(videoRepository.findOne).toHaveBeenCalledWith({
      where: { tiktokVideoId: 'public-video-id' },
    });
  });

  it('rejects missing, unknown, and expired OAuth state before contacting TikTok', async () => {
    await expect(service.completeConnection('', 'state')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.completeConnection('code', '')).rejects.toThrow(
      BadRequestException,
    );

    connectionRepository.createQueryBuilder.mockReturnValueOnce(
      createQueryBuilder(null),
    );
    await expect(
      service.completeConnection('code', 'unknown-state'),
    ).rejects.toThrow(
      new BadRequestException('El estado OAuth no es válido o ha caducado'),
    );

    connectionRepository.createQueryBuilder.mockReturnValueOnce(
      createQueryBuilder({
        oauthStateHash: 'hash:expired-state',
        oauthStateExpiresAt: new Date(Date.now() - 1),
      }),
    );
    await expect(
      service.completeConnection('code', 'expired-state'),
    ).rejects.toThrow(
      new BadRequestException('El estado OAuth no es válido o ha caducado'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectionRepository.save).not.toHaveBeenCalled();
  });

  it('uses the token open_id when the profile request fails and keeps displayName null', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      oauthStateHash: 'hash:valid-state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    fetchMock
      .mockResolvedValueOnce(
        providerResponse({
          access_token: 'access-token',
          expires_in: 3600,
          open_id: 'token-open-id',
          refresh_token: 'refresh-token',
          refresh_expires_in: 31536000,
          scope: 'user.info.basic,video.list',
          token_type: 'Bearer',
        }),
      )
      .mockResolvedValueOnce(
        providerResponse(
          {
            error: {
              code: 'invalid_token',
              message: 'Profile unavailable',
              log_id: 'log',
            },
          },
          false,
          401,
        ),
      );

    await expect(
      service.completeConnection('auth-code', 'valid-state'),
    ).resolves.toMatchObject({
      connected: true,
      openId: 'token-open-id',
      displayName: null,
    });
    expect(connection).toMatchObject({
      openId: 'token-open-id',
      displayName: null,
      accessToken: 'encrypted:access-token',
      refreshToken: 'encrypted:refresh-token',
    });
    expect(connectionRepository.save).toHaveBeenCalledTimes(2);
  });

  it('does not validate an incomplete successful OAuth token response before using it', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      oauthStateHash: 'hash:valid-state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    const cryptoConfig = new ConfigService();
    cryptoConfig.set(
      'TIKTOK_TOKEN_ENCRYPTION_KEY',
      'test-only-tiktok-encryption-key-32-chars',
    );
    const cryptoWithTestKey = new TiktokTokenCryptoService(cryptoConfig);
    await moduleRef.close();
    moduleRef = await Test.createTestingModule({
      providers: [
        TiktokConnectionService,
        {
          provide: getRepositoryToken(TiktokConnection),
          useValue: connectionRepository,
        },
        { provide: ConfigService, useValue: configService },
        { provide: TiktokApiService, useValue: tiktokApi },
        {
          provide: TiktokTokenCryptoService,
          useValue: cryptoWithTestKey,
        },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    tiktokConnection = moduleRef.get(TiktokConnectionService);
    service = new TiktokService(tiktokConnection, tiktokVideos);
    fetchMock
      .mockResolvedValueOnce(
        providerResponse({
          expires_in: 3600,
          open_id: 'provider-open-id',
          refresh_token: 'refresh-token',
          refresh_expires_in: 31536000,
          scope: 'user.info.basic,video.list',
          token_type: 'Bearer',
        }),
      )
      .mockResolvedValueOnce(
        providerResponse(
          {
            error: {
              code: 'invalid_token',
              message: 'Missing access token',
              log_id: 'log',
            },
          },
          false,
          401,
        ),
      );

    await expect(
      service.completeConnection('auth-code', 'valid-state'),
    ).rejects.toThrow(/data.*Received undefined/);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
      { headers: { Authorization: 'Bearer undefined' } },
    );
    expect(connection.oauthStateHash).toBeNull();
    expect(connection.oauthStateExpiresAt).toBeNull();
    expect(connectionRepository.save).toHaveBeenCalledTimes(1);
  });

  it('maps an unreadable unsuccessful OAuth response to BadGateway and leaves the consumed state cleared', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      oauthStateHash: 'hash:valid-state',
      oauthStateExpiresAt: new Date(Date.now() + 60_000),
    };
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder(connection),
    );
    const unreadableResponse = providerResponse(null, false, 502);
    jest
      .spyOn(unreadableResponse, 'json')
      .mockRejectedValueOnce(new SyntaxError('invalid JSON'));
    fetchMock.mockResolvedValueOnce(unreadableResponse);

    await expect(
      service.completeConnection('auth-code', 'valid-state'),
    ).rejects.toThrow(
      new BadGatewayException('TikTok OAuth respondió con 502'),
    );
    expect(connection.oauthStateHash).toBeNull();
    expect(connection.oauthStateExpiresAt).toBeNull();
    expect(connectionRepository.save).toHaveBeenCalledTimes(1);
  });

  it('skips video requests when the stored connection lacks the required scope', async () => {
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder({
        openId: 'provider-open-id',
        accessToken: 'encrypted:access-token',
        refreshToken: 'encrypted:refresh-token',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        scope: 'user.info.basic',
      }),
    );

    await expect(service.syncVideos()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(videoRepository.upsert).not.toHaveBeenCalled();
  });

  it('does not persist video rows when the HTTP response fails even if its TikTok error code is ok', async () => {
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder({
        openId: 'provider-open-id',
        accessToken: 'encrypted:access-token',
        refreshToken: 'encrypted:refresh-token',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        scope: 'user.info.basic video.list',
      }),
    );
    fetchMock.mockResolvedValueOnce(
      providerResponse(
        {
          data: { videos: [{ id: 'video-1' }], has_more: false },
          error: { code: 'ok', message: '', log_id: '' },
        },
        false,
        503,
      ),
    );

    await expect(service.syncVideos()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(videoRepository.upsert).not.toHaveBeenCalled();
  });

  it('delegates duplicate video IDs to TypeORM upsert using the TikTok ID conflict key', async () => {
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder({
        openId: 'provider-open-id',
        accessToken: 'encrypted:access-token',
        refreshToken: 'encrypted:refresh-token',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        scope: 'user.info.basic video.list',
      }),
    );
    fetchMock.mockResolvedValueOnce(
      providerResponse({
        data: {
          videos: [
            { id: 'duplicate-id', title: 'Earlier value' },
            { id: 'duplicate-id', title: 'Later value' },
          ],
          has_more: false,
        },
        error: { code: 'ok', message: '', log_id: '' },
      }),
    );

    await service.syncVideos();

    expect(videoRepository.upsert).toHaveBeenCalledTimes(2);
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tiktokVideoId: 'duplicate-id',
        title: 'Earlier value',
      }),
      ['tiktokVideoId'],
    );
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tiktokVideoId: 'duplicate-id',
        title: 'Later value',
      }),
      ['tiktokVideoId'],
    );
  });

  it('keeps prior upserts but stops the current sync after a row persistence failure', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder({
        openId: 'provider-open-id',
        accessToken: 'encrypted:access-token',
        refreshToken: 'encrypted:refresh-token',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        scope: 'user.info.basic video.list',
      }),
    );
    fetchMock.mockResolvedValueOnce(
      providerResponse({
        data: {
          videos: [
            { id: 'saved-first' },
            { id: 'failed-second' },
            { id: 'not-attempted-third' },
          ],
          cursor: 123,
          has_more: true,
        },
        error: { code: 'ok', message: '', log_id: '' },
      }),
    );
    videoRepository.upsert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database write failed'));

    await expect(service.syncVideos()).resolves.toBeUndefined();
    expect(videoRepository.upsert).toHaveBeenCalledTimes(2);
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tiktokVideoId: 'saved-first' }),
      ['tiktokVideoId'],
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'TikTok sync failed: Error: database write failed',
    );
  });

  it('limits a continuing provider cursor to twenty pages', async () => {
    connectionRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder({
        openId: 'provider-open-id',
        accessToken: 'encrypted:access-token',
        refreshToken: 'encrypted:refresh-token',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        scope: 'user.info.basic video.list',
      }),
    );
    fetchMock.mockImplementation(async () =>
      providerResponse({
        data: { videos: [], cursor: 123, has_more: true },
        error: { code: 'ok', message: '', log_id: '' },
      }),
    );

    await service.syncVideos();

    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('sends the reauthorization reminder within fourteen days and records successful delivery', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      openId: 'provider-open-id',
      displayName: 'Riff Valley',
      refreshTokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60_000),
      reauthorizationReminderSentAt: null,
    };
    connectionRepository.findOne.mockResolvedValue(connection);
    mailService.sendTiktokReauthorizationReminder.mockResolvedValue(true);

    await service.checkAuthorizationLifetime();

    expect(mailService.sendTiktokReauthorizationReminder).toHaveBeenCalledWith(
      'Riff Valley',
      connection.refreshTokenExpiresAt,
      expect.any(Number),
    );
    expect(connection.reauthorizationReminderSentAt).toBeInstanceOf(Date);
    expect(connectionRepository.save).toHaveBeenCalledWith(connection);
  });

  it('does not mark an unsent reauthorization reminder as delivered', async () => {
    const connection = {
      connectionKey: 'riff-valley',
      openId: 'provider-open-id',
      displayName: null,
      refreshTokenExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60_000),
      reauthorizationReminderSentAt: null,
    };
    connectionRepository.findOne.mockResolvedValue(connection);
    mailService.sendTiktokReauthorizationReminder.mockResolvedValue(false);

    await service.checkAuthorizationLifetime();

    expect(mailService.sendTiktokReauthorizationReminder).toHaveBeenCalled();
    expect(connection.reauthorizationReminderSentAt).toBeNull();
    expect(connectionRepository.save).not.toHaveBeenCalled();
  });

  it('swallows reminder delivery errors and leaves the sent timestamp unset', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const connection = {
      connectionKey: 'riff-valley',
      openId: 'provider-open-id',
      displayName: null,
      refreshTokenExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60_000),
      reauthorizationReminderSentAt: null,
    };
    connectionRepository.findOne.mockResolvedValue(connection);
    mailService.sendTiktokReauthorizationReminder.mockRejectedValue(
      new Error('mail unavailable'),
    );

    await expect(service.checkAuthorizationLifetime()).resolves.toBeUndefined();
    expect(connection.reauthorizationReminderSentAt).toBeNull();
    expect(connectionRepository.save).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      'No se pudo enviar el aviso de reautorización de TikTok',
      expect.any(String),
    );
  });

  it('deletes only the Riff Valley connection when disconnecting', async () => {
    connectionRepository.delete.mockResolvedValue({ affected: 1 });

    await expect(service.disconnect()).resolves.toEqual({ connected: false });
    expect(connectionRepository.delete).toHaveBeenCalledWith({
      connectionKey: 'riff-valley',
    });
  });

  it('reports disconnected, expiring, and reauthorization-required connection states', async () => {
    connectionRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.getConnection()).resolves.toMatchObject({
      connected: false,
      openId: null,
      displayName: null,
      missingScopes: ['user.info.basic', 'video.list'],
      authorizationStatus: 'disconnected',
      reauthorizationRequired: false,
      reauthorizationReason: null,
      daysUntilReauthorization: null,
    });

    connectionRepository.findOne.mockResolvedValueOnce({
      openId: 'provider-open-id',
      displayName: 'Riff Valley',
      scope: 'user.info.basic video.list',
      expiresAt: new Date(Date.now() + 60 * 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      authorizationInvalidatedAt: null,
      authorizedAt: new Date('2026-10-01T00:00:00Z'),
    });

    const expiring = await service.getConnection();
    expect(expiring).toMatchObject({
      connected: true,
      authorizationStatus: 'expiring_soon',
      reauthorizationRequired: false,
      reauthorizationReason: null,
      missingScopes: [],
    });
    expect(expiring.daysUntilReauthorization).toBeLessThanOrEqual(7);
    expect(expiring.daysUntilReauthorization).toBeGreaterThan(0);

    connectionRepository.findOne.mockResolvedValueOnce({
      openId: 'provider-open-id',
      expiresAt: new Date(Date.now() + 60 * 60_000),
      refreshTokenExpiresAt: new Date(Date.now() - 60_000),
      authorizationInvalidatedAt: null,
    });

    await expect(service.getConnection()).resolves.toMatchObject({
      connected: false,
      authorizationStatus: 'reauthorization_required',
      reauthorizationRequired: true,
      reauthorizationReason: 'refresh_token_expired',
      daysUntilReauthorization: 0,
    });

    connectionRepository.findOne.mockResolvedValueOnce({
      authorizationInvalidatedAt: new Date(),
    });

    await expect(service.getConnection()).resolves.toMatchObject({
      connected: false,
      authorizationStatus: 'reauthorization_required',
      reauthorizationRequired: true,
      reauthorizationReason: 'refresh_token_invalid',
      daysUntilReauthorization: null,
    });
  });

  it('returns 404 when the requested local video does not exist', async () => {
    videoRepository.findOne.mockResolvedValue(null);

    await expect(service.findVideoDetail('missing-video')).rejects.toThrow(
      NotFoundException,
    );
    expect(videoRepository.findOne).toHaveBeenCalledWith({
      where: { tiktokVideoId: 'missing-video' },
    });
  });
});
