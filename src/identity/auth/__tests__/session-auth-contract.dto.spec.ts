import 'reflect-metadata';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AUTH_SESSION_MODE,
  AUTH_SESSION_MODE_HEADER,
  SESSION_ACCESS_TOKEN_TTL_SECONDS,
  SessionAuthErrorResponse,
  SessionLoginDto,
  SessionLoginResponseDto,
  SessionRefreshResponseDto,
} from '../dto/session-auth-contract.dto';
import { LoginUserDto } from '../dto/login-user.dto';

const validationOptions = { whitelist: true, forbidNonWhitelisted: true };

describe('session auth HTTP contracts', () => {
  it('reuses legacy login validation and rejects arbitrary client identifiers', async () => {
    const legacy = plainToInstance(LoginUserDto, {
      username: 'valid-user',
      password: 'Password1',
    });
    const session = plainToInstance(SessionLoginDto, {
      username: 'valid-user',
      password: 'Password1',
    });

    expect(await validate(session, validationOptions)).toEqual(
      await validate(legacy, validationOptions),
    );
    await expect(validate(session, validationOptions)).resolves.toHaveLength(0);

    const withClientId = plainToInstance(SessionLoginDto, {
      username: 'valid-user',
      password: 'Password1',
      clientType: 'app',
    });
    const errors = await validate(withClientId, validationOptions);
    expect(errors.map(({ property }) => property)).toContain('clientType');
  });

  it('keeps the negotiated login wire shape compatible with legacy login fields', () => {
    const response: SessionLoginResponseDto = Object.assign(
      new SessionLoginResponseDto(),
      {
        id: 'user-id',
        username: 'valid-user',
        role: 'user',
        token: 'short-lived-access-jwt',
        csrfToken: 'session-bound-csrf',
        logoutCsrfToken: 'session-bound-logout-csrf',
        image: null,
        dashboardButtonsEnabled: true,
        dashboardConfig: [{ id: 'ratings', enabled: true }],
        mobileDashboardConfig: null,
        password: 'must-not-serialize',
        email: 'private@example.test',
        sessionId: 'internal-session-id',
        refreshToken: 'refresh-cookie-only',
      },
    );

    expect(instanceToPlain(response)).toEqual({
      id: 'user-id',
      username: 'valid-user',
      role: 'user',
      token: 'short-lived-access-jwt',
      csrfToken: 'session-bound-csrf',
      logoutCsrfToken: 'session-bound-logout-csrf',
      image: null,
      dashboardButtonsEnabled: true,
      dashboardConfig: [{ id: 'ratings', enabled: true }],
      mobileDashboardConfig: null,
    });
  });

  it('serializes refresh JSON with public user and absolute session expiry only', () => {
    const response = plainToInstance(SessionRefreshResponseDto, {
      token: 'short-lived-access-jwt',
      csrfToken: 'session-bound-csrf',
      logoutCsrfToken: 'session-bound-logout-csrf',
      expiresAt: '2026-11-20T00:00:00.000Z',
      user: {
        id: 'user-id',
        username: 'valid-user',
        role: 'user',
        image: null,
        password: 'must-not-serialize',
        email: 'private@example.test',
        sessionId: 'internal-session-id',
        refreshToken: 'refresh-cookie-only',
      },
      refreshToken: 'must-not-serialize',
    });

    expect(instanceToPlain(response)).toEqual({
      token: 'short-lived-access-jwt',
      csrfToken: 'session-bound-csrf',
      logoutCsrfToken: 'session-bound-logout-csrf',
      expiresAt: '2026-11-20T00:00:00.000Z',
      user: {
        id: 'user-id',
        username: 'valid-user',
        role: 'user',
        image: null,
      },
    });
  });

  it('pins the documented mode, access-token duration, and generic error envelope', () => {
    expect(AUTH_SESSION_MODE_HEADER).toBe('X-Auth-Session-Mode');
    expect(AUTH_SESSION_MODE).toBe('refresh-v1');
    expect(SESSION_ACCESS_TOKEN_TTL_SECONDS).toBe(900);

    const error: SessionAuthErrorResponse = {
      statusCode: 401,
      message: 'Authentication is not valid',
      error: 'Unauthorized',
    };
    expect(error).not.toHaveProperty('sessionId');
    expect(error).not.toHaveProperty('refreshToken');
  });
});
