import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import * as request from 'supertest';
import { ActivityService } from '../../activity/activity.service';
import { UsersService } from '../../users/users.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AUTH_SESSION_MODE } from '../dto/session-auth-contract.dto';
import { AuthRateLimitService } from '../rate-limiting/auth-rate-limit.service';
import { SessionsService } from '../../sessions/sessions.service';
import {
  createSessionCsrfToken,
  createSessionCsrfVerifier,
} from '../session-http/session-http-csrf';

const appOrigin = 'https://app.riffvalley.es';
const wikiOrigin = 'https://wiki.riffvalley.es';
const edgeSecret = Buffer.alloc(32, 9).toString('base64url');
const jwtSecret = 'test-jwt-secret-for-csrf-signing';
const refreshToken = Buffer.alloc(32, 6).toString('base64url');

describe('renewable login HTTP contract', () => {
  let app: INestApplication;
  let authService: {
    loginWithSession: jest.Mock;
    resolveSessionLoginClient: jest.Mock;
    refreshWithSession: jest.Mock;
  };
  let configService: ConfigService;
  let sessionsService: {
    findRefreshTokenSessionBinding: jest.Mock;
    revokeSession: jest.Mock;
  };
  let authRateLimitService: { consume: jest.Mock };

  beforeAll(async () => {
    authService = {
      loginWithSession: jest.fn().mockImplementation(async () => ({
        user: {
          id: 'user-1',
          username: 'listener',
          role: 'user',
          dashboardButtonsEnabled: true,
          password: 'must-not-serialize',
          internalField: 'must-not-serialize',
        },
        accessToken: 'short-lived-access-token',
        refreshCredential: {
          sessionId: 'internal-session-id',
          userId: 'user-1',
          clientType: 'app',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          refreshToken,
        },
      })),
      resolveSessionLoginClient: jest.fn().mockReturnValue('app'),
      refreshWithSession: jest.fn().mockImplementation(async () => ({
        user: {
          id: 'user-1',
          username: 'listener',
          role: 'user',
          dashboardConfig: null,
          mobileDashboardConfig: [{ id: 'news', enabled: false }],
          dashboardButtonsEnabled: false,
          password: 'must-not-serialize',
          internalField: 'must-not-serialize',
        },
        accessToken: 'short-lived-access-token',
        refreshCredential: {
          sessionId: 'internal-session-id',
          userId: 'user-1',
          clientType: 'app',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
          refreshToken: Buffer.alloc(32, 7).toString('base64url'),
        },
      })),
    };
    sessionsService = {
      findRefreshTokenSessionBinding: jest.fn().mockResolvedValue({
        sessionId: 'internal-session-id',
        userId: 'user-1',
        clientType: 'app',
      }),
      revokeSession: jest.fn().mockResolvedValue(true),
    };
    authRateLimitService = {
      consume: jest.fn().mockResolvedValue(null),
    };

    configService = new ConfigService({
      AUTH_SESSION_MODE_ENABLED: 'true',
      AUTH_SESSION_APP_ORIGIN: appOrigin,
      AUTH_SESSION_WIKI_ORIGIN: wikiOrigin,
      AUTH_SESSION_EDGE_SECRET: edgeSecret,
      JWT_SECRET: jwtSecret,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: {} },
        { provide: ActivityService, useValue: {} },
        { provide: ConfigService, useValue: configService },
        { provide: SessionsService, useValue: sessionsService },
        {
          provide: AuthRateLimitService,
          useValue: authRateLimitService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(json());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    configService.set('AUTH_SESSION_MODE_ENABLED', 'true');
    authService.loginWithSession.mockClear();
    authService.resolveSessionLoginClient.mockClear();
    authService.refreshWithSession.mockClear();
    sessionsService.findRefreshTokenSessionBinding.mockClear();
    sessionsService.revokeSession.mockClear();
    authRateLimitService.consume.mockReset().mockResolvedValue(null);
  });

  async function getBootstrap(
    origin = appOrigin,
  ): Promise<{ csrfToken: string; cookie: string }> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Origin', origin)
      .set('X-RV-Session-Edge', edgeSecret)
      .set('Sec-Fetch-Site', 'same-site');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const cookieHeader = response.headers['set-cookie'];
    const setCookie = Array.isArray(cookieHeader) ? cookieHeader : [];
    const nonceCookie = setCookie.find((cookie) =>
      cookie.startsWith('__Secure-rv_login_csrf_nonce='),
    );
    expect(nonceCookie).toBeDefined();
    expect(nonceCookie).toContain('HttpOnly');
    expect(nonceCookie).toContain('Secure');
    expect(nonceCookie).toContain('SameSite=Lax');
    return {
      csrfToken: response.body.csrfToken as string,
      cookie: nonceCookie!.split(';', 1)[0],
    };
  }

  function postLogin(
    csrfToken: string,
    cookie: string,
    overrides: Record<string, string> = {},
    body: Record<string, string> = {
      username: 'listener',
      password: 'Password1',
    },
  ) {
    const headers: Record<string, string> = {
      Origin: appOrigin,
      'Content-Type': 'application/json',
      'X-Auth-Session-Mode': AUTH_SESSION_MODE,
      'X-CSRF-Token': csrfToken,
      Cookie: cookie,
      'X-RV-Session-Edge': edgeSecret,
      'Sec-Fetch-Site': 'same-site',
      ...overrides,
    };
    const loginRequest = request(app.getHttpServer())
      .post('/api/auth/login')
      .set(headers);
    return headers['Content-Type'] === 'text/plain'
      ? loginRequest.send(JSON.stringify(body))
      : loginRequest.send(body);
  }

  function postLogout(origin: string, csrfToken: string, cookie?: string) {
    const headers: Record<string, string> = {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'X-RV-Session-Edge': edgeSecret,
      'Sec-Fetch-Site': 'same-site',
    };
    if (cookie !== undefined) headers.Cookie = cookie;
    return request(app.getHttpServer())
      .post('/api/auth/logout')
      .set(headers)
      .send({});
  }

  it('bootstraps CSRF and returns the public profile, session CSRF token and 15-minute access token', async () => {
    const bootstrap = await getBootstrap();
    const response = await postLogin(bootstrap.csrfToken, bootstrap.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'user-1',
      username: 'listener',
      role: 'user',
      dashboardButtonsEnabled: true,
      token: 'short-lived-access-token',
      csrfToken: expect.any(String),
      logoutCsrfToken: expect.any(String),
    });
    expect(
      createSessionCsrfVerifier(
        jwtSecret,
        'refresh',
        'internal-session-id',
      )(response.body.csrfToken as string, 'app'),
    ).toEqual({ valid: true });
    expect(
      createSessionCsrfVerifier(
        jwtSecret,
        'logout',
        'internal-session-id',
      )(response.body.logoutCsrfToken as string, 'app'),
    ).toEqual({ valid: true });
    expect(JSON.stringify(response.body)).not.toContain(refreshToken);
    expect(JSON.stringify(response.body)).not.toContain('sessionId');
    const cookieHeader = response.headers['set-cookie'];
    const setCookie = Array.isArray(cookieHeader) ? cookieHeader : [];
    expect(setCookie).toHaveLength(1);
    expect(setCookie[0]).toMatch(/^__Secure-rv_app_refresh=/);
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('Secure');
    expect(setCookie[0]).toContain('Path=/api/auth');
    expect(setCookie[0]).toContain('Expires=');
    expect(authService.resolveSessionLoginClient).toHaveBeenCalledWith({
      mode: AUTH_SESSION_MODE,
      origin: appOrigin,
    });
    expect(authService.loginWithSession).toHaveBeenCalledTimes(1);
  });

  it('returns a generic 429 with Retry-After when the CSRF bootstrap IP is limited', async () => {
    authRateLimitService.consume.mockResolvedValueOnce(37);

    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Origin', appOrigin)
      .set('X-RV-Session-Edge', edgeSecret)
      .set('Sec-Fetch-Site', 'same-site');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('37');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain('refresh');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('applies the account and IP limit to renewable login before issuing a cookie', async () => {
    const bootstrap = await getBootstrap();
    authRateLimitService.consume.mockResolvedValueOnce(37);

    const response = await postLogin(bootstrap.csrfToken, bootstrap.cookie);

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('37');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  it('binds the bootstrap token and refresh cookie to the exact Wiki Origin', async () => {
    authService.resolveSessionLoginClient.mockReturnValueOnce('wiki');
    const bootstrap = await getBootstrap(wikiOrigin);
    const response = await postLogin(bootstrap.csrfToken, bootstrap.cookie, {
      Origin: wikiOrigin,
    });

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toContainEqual(
      expect.stringMatching(/^__Secure-rv_wiki_refresh=/),
    );
    expect(authService.loginWithSession).toHaveBeenCalledWith(
      { username: 'listener', password: 'Password1' },
      { mode: AUTH_SESSION_MODE, origin: wikiOrigin },
    );
  });

  it.each([
    ['missing edge assertion', { 'X-RV-Session-Edge': '' }],
    ['forged edge assertion', { 'X-RV-Session-Edge': 'A'.repeat(43) }],
    [
      'ambiguous edge assertion',
      { 'X-RV-Session-Edge': `${edgeSecret},${edgeSecret}` },
    ],
    [
      'forwarded proto only',
      { 'X-RV-Session-Edge': '', 'X-Forwarded-Proto': 'https' },
    ],
    ['unapproved Origin', { Origin: 'https://evil.example.test' }],
    ['HTTP Origin', { Origin: 'http://app.riffvalley.es' }],
    ['missing CSRF token', { 'X-CSRF-Token': '' }],
    ['invalid CSRF token', { 'X-CSRF-Token': 'invalid' }],
    ['duplicate bootstrap nonce cookie', { Cookie: 'duplicate' }],
    ['unrecognized Fetch Metadata', { 'Sec-Fetch-Site': 'none' }],
    ['ambiguous Fetch Metadata', { 'Sec-Fetch-Site': 'same-site,cross-site' }],
    ['non-JSON Content-Type', { 'Content-Type': 'text/plain' }],
  ] as const)(
    'rejects %s before authentication or session creation',
    async (_caseName, overrides) => {
      const bootstrap = await getBootstrap();
      const response = await postLogin(
        bootstrap.csrfToken,
        bootstrap.cookie,
        overrides,
      );

      expect(response.status).toBe(
        _caseName === 'non-JSON Content-Type' ? 400 : 403,
      );
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(authService.loginWithSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['no verifiable HTTPS', { 'X-RV-Session-Edge': '' }],
    ['unapproved Origin', { Origin: 'https://evil.example.test' }],
    ['invalid Fetch Metadata', { 'Sec-Fetch-Site': 'none' }],
  ] as const)(
    'does not issue a bootstrap nonce for %s',
    async (_caseName, overrides) => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set({
          Origin: appOrigin,
          'X-RV-Session-Edge': edgeSecret,
          'Sec-Fetch-Site': 'same-site',
          ...overrides,
        });

      expect(response.status).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('does not accept an app bootstrap token for a Wiki Origin', async () => {
    const bootstrap = await getBootstrap(appOrigin);
    const response = await postLogin(bootstrap.csrfToken, bootstrap.cookie, {
      Origin: wikiOrigin,
    });

    expect(response.status).toBe(403);
    expect(authService.loginWithSession).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('does not accept a client identifier supplied in the login body', async () => {
    const bootstrap = await getBootstrap();
    const response = await postLogin(
      bootstrap.csrfToken,
      bootstrap.cookie,
      {},
      {
        username: 'listener',
        password: 'Password1',
        clientType: 'wiki',
      },
    );

    expect(response.status).toBe(400);
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  it('keeps both bootstrap and negotiated login unavailable when the gate is off', async () => {
    configService.set('AUTH_SESSION_MODE_ENABLED', 'false');
    const bootstrapResponse = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Origin', appOrigin)
      .set('X-RV-Session-Edge', edgeSecret);
    expect(bootstrapResponse.status).toBe(503);
    expect(bootstrapResponse.headers['cache-control']).toBe('no-store');
    expect(bootstrapResponse.headers['set-cookie']).toBeUndefined();

    const sessionResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Auth-Session-Mode', AUTH_SESSION_MODE)
      .send({ username: 'listener', password: 'Password1' });
    expect(sessionResponse.status).toBe(503);
    expect(sessionResponse.headers['cache-control']).toBe('no-store');
    expect(sessionResponse.headers['set-cookie']).toBeUndefined();
    expect(authService.loginWithSession).not.toHaveBeenCalled();

    const missingModeResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'legacy', password: 'Password1' });
    expect(missingModeResponse.status).toBe(503);
    expect(missingModeResponse.headers['cache-control']).toBe('no-store');
    expect(missingModeResponse.headers['set-cookie']).toBeUndefined();
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  it('fails closed when rate limit storage is unavailable', async () => {
    const bootstrap = await getBootstrap();
    authRateLimitService.consume.mockRejectedValueOnce(
      new ServiceUnavailableException(
        'Authentication controls are unavailable',
      ),
    );

    const response = await postLogin(bootstrap.csrfToken, bootstrap.cookie);

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain('database');
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  it('rejects login without refresh-v1 and never creates a legacy token or session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'legacy', password: 'Password1' });

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  it('rotates the app cookie and returns only the new access token and public profile', async () => {
    const sessionCsrf = createSessionCsrfToken(
      jwtSecret,
      'refresh',
      'app',
      'internal-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set({
        Origin: appOrigin,
        'Content-Type': 'application/json',
        'X-Auth-Session-Mode': AUTH_SESSION_MODE,
        'X-Refresh-Operation': '123e4567-e89b-42d3-a456-426614174000',
        'X-CSRF-Token': sessionCsrf!,
        Cookie: `__Secure-rv_app_refresh=${refreshToken}`,
        'X-RV-Session-Edge': edgeSecret,
        'Sec-Fetch-Site': 'same-site',
      })
      .send({});

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      token: 'short-lived-access-token',
      csrfToken: expect.any(String),
      logoutCsrfToken: expect.any(String),
      expiresAt: expect.any(String),
      user: {
        id: 'user-1',
        username: 'listener',
        role: 'user',
        dashboardConfig: null,
        mobileDashboardConfig: [{ id: 'news', enabled: false }],
        dashboardButtonsEnabled: false,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(refreshToken);
    expect(
      createSessionCsrfVerifier(
        jwtSecret,
        'refresh',
        'internal-session-id',
      )(response.body.csrfToken as string, 'app'),
    ).toEqual({ valid: true });
    expect(
      createSessionCsrfVerifier(
        jwtSecret,
        'logout',
        'internal-session-id',
      )(response.body.logoutCsrfToken as string, 'app'),
    ).toEqual({ valid: true });
    expect(response.headers['set-cookie']).toContainEqual(
      expect.stringMatching(/^__Secure-rv_app_refresh=/),
    );
    expect(response.headers['set-cookie']).toContainEqual(
      expect.stringContaining(
        `Expires=${new Date(response.body.expiresAt as string).toUTCString()}`,
      ),
    );
    expect(authService.refreshWithSession).toHaveBeenCalledWith(
      refreshToken,
      '123e4567-e89b-42d3-a456-426614174000',
      { mode: AUTH_SESSION_MODE, origin: appOrigin },
    );
  });

  it('returns a generic 429 before refresh rotation when the session bucket is limited', async () => {
    const sessionCsrf = createSessionCsrfToken(
      jwtSecret,
      'refresh',
      'app',
      'internal-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    authRateLimitService.consume
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(37);

    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set({
        Origin: appOrigin,
        'Content-Type': 'application/json',
        'X-Auth-Session-Mode': AUTH_SESSION_MODE,
        'X-Refresh-Operation': '123e4567-e89b-42d3-a456-426614174000',
        'X-CSRF-Token': sessionCsrf!,
        Cookie: `__Secure-rv_app_refresh=${refreshToken}`,
        'X-RV-Session-Edge': edgeSecret,
        'Sec-Fetch-Site': 'same-site',
      })
      .send({});

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('37');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(authService.refreshWithSession).not.toHaveBeenCalled();
  });

  it.each([
    ['unapproved Origin', { Origin: 'https://evil.example.test' }],
    ['missing CSRF token', { 'X-CSRF-Token': '' }],
    ['invalid Fetch Metadata', { 'Sec-Fetch-Site': 'none' }],
    ['missing edge assertion', { 'X-RV-Session-Edge': '' }],
  ] as const)(
    'rejects refresh for %s before rotation',
    async (_label, overrides) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set({
          Origin: appOrigin,
          'Content-Type': 'application/json',
          'X-Auth-Session-Mode': AUTH_SESSION_MODE,
          'X-Refresh-Operation': '123e4567-e89b-42d3-a456-426614174000',
          'X-CSRF-Token': 'invalid',
          Cookie: `__Secure-rv_app_refresh=${refreshToken}`,
          'X-RV-Session-Edge': edgeSecret,
          'Sec-Fetch-Site': 'same-site',
          ...overrides,
        })
        .send({});

      expect(response.status).toBe(403);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      if (_label === 'missing CSRF token') {
        expect(
          sessionsService.findRefreshTokenSessionBinding,
        ).toHaveBeenCalledTimes(1);
      } else {
        expect(
          sessionsService.findRefreshTokenSessionBinding,
        ).not.toHaveBeenCalled();
      }
      expect(authService.refreshWithSession).not.toHaveBeenCalled();
    },
  );

  it('rejects a refresh cookie from the other client', async () => {
    sessionsService.findRefreshTokenSessionBinding.mockResolvedValueOnce(null);
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set({
        Origin: wikiOrigin,
        'Content-Type': 'application/json',
        'X-Auth-Session-Mode': AUTH_SESSION_MODE,
        'X-Refresh-Operation': '123e4567-e89b-42d3-a456-426614174000',
        Cookie: `__Secure-rv_wiki_refresh=${refreshToken}`,
        'X-RV-Session-Edge': edgeSecret,
        'Sec-Fetch-Site': 'same-site',
        'X-CSRF-Token': 'invalid',
      })
      .send({});

    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain(refreshToken);
    expect(authService.refreshWithSession).not.toHaveBeenCalled();
  });

  it('keeps refresh unavailable while the feature gate is off', async () => {
    configService.set('AUTH_SESSION_MODE_ENABLED', 'false');
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set({
        Origin: appOrigin,
        'X-Auth-Session-Mode': AUTH_SESSION_MODE,
        Cookie: `__Secure-rv_app_refresh=${refreshToken}`,
      })
      .send({});

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      sessionsService.findRefreshTokenSessionBinding,
    ).not.toHaveBeenCalled();
  });

  it('rejects fields in the refresh body without inspecting the cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set({
        Origin: appOrigin,
        'Content-Type': 'application/json',
        'X-Auth-Session-Mode': AUTH_SESSION_MODE,
        'X-RV-Session-Edge': edgeSecret,
      })
      .send({ refreshToken });

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(
      sessionsService.findRefreshTokenSessionBinding,
    ).not.toHaveBeenCalled();
    expect(authService.refreshWithSession).not.toHaveBeenCalled();
  });

  it('revokes only the session selected by the app refresh cookie and clears it', async () => {
    const logoutCsrf = createSessionCsrfToken(
      jwtSecret,
      'logout',
      'app',
      'internal-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    const response = await postLogout(
      appOrigin,
      logoutCsrf!,
      `__Secure-rv_app_refresh=${refreshToken}`,
    );

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.headers['set-cookie']).toContainEqual(
      expect.stringMatching(/^__Secure-rv_app_refresh=;/),
    );
    const cookieHeader = response.headers['set-cookie'];
    const clearCookie = Array.isArray(cookieHeader)
      ? cookieHeader[0]
      : (cookieHeader ?? '');
    expect(clearCookie).toContain('HttpOnly');
    expect(clearCookie).toContain('Secure');
    expect(clearCookie).toContain('SameSite=Lax');
    expect(clearCookie).toContain('Path=/api/auth');
    expect(clearCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(sessionsService.revokeSession).toHaveBeenCalledWith({
      sessionId: 'internal-session-id',
      userId: 'user-1',
      clientType: 'app',
    });
  });

  it('returns a generic 429 before logout revocation when the session bucket is limited', async () => {
    const logoutCsrf = createSessionCsrfToken(
      jwtSecret,
      'logout',
      'app',
      'internal-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    authRateLimitService.consume
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(37);

    const response = await postLogout(
      appOrigin,
      logoutCsrf!,
      `__Secure-rv_app_refresh=${refreshToken}`,
    );

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('37');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sessionsService.revokeSession).not.toHaveBeenCalled();
  });

  it('makes repeated logout idempotent while the old cookie is still presented', async () => {
    const logoutCsrf = createSessionCsrfToken(
      jwtSecret,
      'logout',
      'app',
      'internal-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    const cookie = `__Secure-rv_app_refresh=${refreshToken}`;

    const first = await postLogout(appOrigin, logoutCsrf!, cookie);
    const second = await postLogout(appOrigin, logoutCsrf!, cookie);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(sessionsService.revokeSession).toHaveBeenCalledTimes(2);
  });

  it('clears an absent refresh cookie idempotently with a valid logout CSRF token', async () => {
    const logoutCsrf = createSessionCsrfToken(
      jwtSecret,
      'logout',
      'app',
      'previous-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    const response = await postLogout(appOrigin, logoutCsrf!);

    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']).toContainEqual(
      expect.stringMatching(/^__Secure-rv_app_refresh=;/),
    );
    expect(
      sessionsService.findRefreshTokenSessionBinding,
    ).not.toHaveBeenCalled();
    expect(sessionsService.revokeSession).not.toHaveBeenCalled();
  });

  it('rejects logout when the CSRF token belongs to the other client', async () => {
    const appLogoutCsrf = createSessionCsrfToken(
      jwtSecret,
      'logout',
      'app',
      'internal-session-id',
      Date.now() + 5 * 60 * 1000,
    );
    const response = await postLogout(
      wikiOrigin,
      appLogoutCsrf!,
      `__Secure-rv_app_refresh=${refreshToken}`,
    );

    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sessionsService.revokeSession).not.toHaveBeenCalled();
  });

  it('does not revoke or clear the cookie when logout CSRF is invalid', async () => {
    const response = await postLogout(
      appOrigin,
      'invalid-csrf',
      `__Secure-rv_app_refresh=${refreshToken}`,
    );

    expect(response.status).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      sessionsService.findRefreshTokenSessionBinding,
    ).toHaveBeenCalledTimes(1);
    expect(sessionsService.revokeSession).not.toHaveBeenCalled();
  });

  it('keeps logout unavailable and side-effect free while the feature gate is off', async () => {
    configService.set('AUTH_SESSION_MODE_ENABLED', 'false');
    const response = await postLogout(
      appOrigin,
      'unused-token',
      `__Secure-rv_app_refresh=${refreshToken}`,
    );

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      sessionsService.findRefreshTokenSessionBinding,
    ).not.toHaveBeenCalled();
    expect(sessionsService.revokeSession).not.toHaveBeenCalled();
  });
});
