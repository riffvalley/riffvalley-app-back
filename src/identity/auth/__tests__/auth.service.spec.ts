import * as bcrypt from 'bcrypt';
import {
  ForbiddenException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ValidRoles } from '../interfaces/valid-roles';
import { UsersService } from '../../users/users.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ConfigService } from '@nestjs/config';
import {
  InvalidSessionCredentialError,
  RefreshOperationAlreadyProcessedError,
  RefreshTokenReuseDetectedError,
} from '../../sessions/errors/sessions.errors';

function makeUser(values: Partial<User>): User {
  return Object.assign(new User(), values);
}

describe('AuthService authentication', () => {
  const usersService = {
    createAccount: jest.fn(),
    findCredentialsByUsername: jest.fn(),
    findIdentityById: jest.fn(),
    findById: jest.fn(),
    findSessionProfileById: jest.fn(),
    recordLogin: jest.fn(),
  } satisfies Pick<
    UsersService,
    | 'createAccount'
    | 'findCredentialsByUsername'
    | 'findIdentityById'
    | 'findById'
    | 'findSessionProfileById'
    | 'recordLogin'
  >;
  const jwtService = {
    sign: jest.fn((payload: JwtPayload, options?: { expiresIn: string }) => {
      void payload;
      void options;
      return 'signed-token';
    }),
  };
  const sessionsService = {
    createSession: jest.fn(),
    revokeSession: jest.fn(),
    rotateRefreshToken: jest.fn(),
  } satisfies Pick<
    SessionsService,
    'createSession' | 'revokeSession' | 'rotateRefreshToken'
  >;
  const configValues: Record<string, string | undefined> = {};
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } satisfies Pick<ConfigService, 'get'>;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.recordLogin.mockResolvedValue(undefined);
    sessionsService.revokeSession.mockResolvedValue(true);
    for (const key of Object.keys(configValues)) delete configValues[key];
    service = new AuthService(
      usersService as never,
      jwtService as never,
      sessionsService as never,
      configService as never,
    );
  });

  it('coordinates public account creation with Users and adds the existing JWT', async () => {
    usersService.createAccount.mockResolvedValue(
      Object.assign(new User(), {
        id: 'user-1',
        username: 'listener',
        role: ValidRoles.user,
      }),
    );

    await expect(
      service.create({
        email: 'listener@example.test',
        username: 'listener',
        password: 'Password1',
        image: '',
      }),
    ).resolves.toMatchObject({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.user,
      token: 'signed-token',
    });
    expect(usersService.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'listener' }),
    );
    expect(jwtService.sign).toHaveBeenCalledWith({
      username: 'listener',
      id: 'user-1',
      role: ValidRoles.user,
    });
  });

  it('rotates through Sessions and signs a 15-minute access token', async () => {
    configValues.AUTH_SESSION_MODE_ENABLED = 'true';
    configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
    configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';
    const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
    sessionsService.rotateRefreshToken.mockResolvedValue({
      sessionId: 'session-1',
      userId: 'user-1',
      clientType: 'app',
      createdAt: new Date(),
      expiresAt,
      refreshToken: 'rotated-refresh-token',
    });
    usersService.findSessionProfileById.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        role: ValidRoles.user,
        isActive: true,
        password: 'secret',
        dashboardConfig: null,
        mobileDashboardConfig: [{ id: 'news', enabled: false }],
        dashboardButtonsEnabled: false,
      }),
    );

    const result = await service.refreshWithSession(
      'presented-refresh-token',
      '123e4567-e89b-42d3-a456-426614174000',
      { mode: 'refresh-v1', origin: 'https://app.example.test' },
    );

    expect(sessionsService.rotateRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'presented-refresh-token',
      operationId: '123e4567-e89b-42d3-a456-426614174000',
      clientType: 'app',
    });
    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        username: 'listener',
        id: 'user-1',
        role: ValidRoles.user,
        clientType: 'app',
      },
      { expiresIn: '15m' },
    );
    expect(result).toMatchObject({
      accessToken: 'signed-token',
      refreshCredential: { expiresAt, refreshToken: 'rotated-refresh-token' },
      user: {
        id: 'user-1',
        username: 'listener',
        role: ValidRoles.user,
        dashboardConfig: null,
        mobileDashboardConfig: [{ id: 'news', enabled: false }],
        dashboardButtonsEnabled: false,
      },
    });
    expect(result.user).not.toHaveProperty('password');
  });

  it.each([
    [new InvalidSessionCredentialError(), UnauthorizedException],
    [new RefreshTokenReuseDetectedError(), UnauthorizedException],
    [new RefreshOperationAlreadyProcessedError(), ConflictException],
  ])(
    'maps refresh failure to the generic public error',
    async (failure, ErrorType) => {
      configValues.AUTH_SESSION_MODE_ENABLED = 'true';
      configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
      configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';
      sessionsService.rotateRefreshToken.mockRejectedValue(failure);

      await expect(
        service.refreshWithSession(
          'presented-refresh-token',
          '123e4567-e89b-42d3-a456-426614174000',
          { mode: 'refresh-v1', origin: 'https://app.example.test' },
        ),
      ).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it('resolves only the two exact configured client origins after the gate opens', () => {
    const context = { mode: 'refresh-v1', origin: 'https://app.example.test' };
    expect(() => service.resolveSessionLoginClient(context)).toThrow(
      ServiceUnavailableException,
    );

    configValues.AUTH_SESSION_MODE_ENABLED = 'true';
    configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
    configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';

    expect(service.resolveSessionLoginClient(context)).toBe('app');
    expect(
      service.resolveSessionLoginClient({
        mode: 'refresh-v1',
        origin: 'https://wiki.example.test',
      }),
    ).toBe('wiki');
    expect(() =>
      service.resolveSessionLoginClient({
        mode: 'refresh-v1',
        origin: 'https://evil.example.test',
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.resolveSessionLoginClient({
        mode: 'other-mode',
        origin: 'https://app.example.test',
      }),
    ).toThrow(ServiceUnavailableException);
    expect(sessionsService.createSession).not.toHaveBeenCalled();
  });

  it('keeps the internal session flow unavailable unless explicitly enabled', async () => {
    await expect(
      service.loginWithSession(
        { username: 'listener', password: 'Password1' },
        { mode: 'refresh-v1', origin: 'https://app.example.test' },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(sessionsService.createSession).not.toHaveBeenCalled();
  });

  it('binds an enabled internal login to one exact configured origin', async () => {
    configValues.AUTH_SESSION_MODE_ENABLED = 'true';
    configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
    configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';
    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
        role: ValidRoles.user,
      }),
    );
    usersService.findIdentityById.mockResolvedValue({
      id: 'user-1',
      role: ValidRoles.user,
      isActive: true,
    });
    sessionsService.createSession.mockResolvedValue({
      sessionId: 'session-id',
      userId: 'user-1',
      clientType: 'wiki',
      createdAt: new Date('2026-10-21T00:00:00Z'),
      expiresAt: new Date('2026-11-20T00:00:00Z'),
      refreshToken: 'sensitive-refresh-token',
    });
    const logSpy = jest.spyOn(Logger.prototype, 'log');
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const result = await service.loginWithSession(
      { username: 'listener', password: 'Password1' },
      { mode: 'refresh-v1', origin: 'https://wiki.example.test' },
    );

    expect(sessionsService.createSession).toHaveBeenCalledWith({
      userId: 'user-1',
      clientType: 'wiki',
    });
    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        username: 'listener',
        id: 'user-1',
        role: ValidRoles.user,
        clientType: 'wiki',
      },
      { expiresIn: '15m' },
    );
    expect(result).toMatchObject({
      accessToken: 'signed-token',
      refreshCredential: { refreshToken: 'sensitive-refresh-token' },
    });
    expect(result.user).not.toHaveProperty('password');
    const emittedLogs = [logSpy, warnSpy, errorSpy]
      .flatMap((spy) => spy.mock.calls.flat())
      .join(' ');
    expect(emittedLogs).not.toContain('sensitive-refresh-token');
    expect(emittedLogs).not.toContain('signed-token');
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('rejects a browser-selected client, non-allowlisted Origin and inactive account', async () => {
    configValues.AUTH_SESSION_MODE_ENABLED = 'true';
    configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
    configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';

    await expect(
      service.loginWithSession(
        { username: 'listener', password: 'Password1' },
        { mode: 'refresh-v1', origin: 'https://evil.example.test' },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(sessionsService.createSession).not.toHaveBeenCalled();

    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
        role: ValidRoles.user,
      }),
    );
    usersService.findIdentityById.mockResolvedValue({
      id: 'user-1',
      role: ValidRoles.user,
      isActive: false,
    });
    await expect(
      service.loginWithSession(
        { username: 'listener', password: 'Password1' },
        { mode: 'refresh-v1', origin: 'https://app.example.test' },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(sessionsService.createSession).not.toHaveBeenCalled();
  });

  it('rejects invalid session-login credentials without creating a session', async () => {
    configValues.AUTH_SESSION_MODE_ENABLED = 'true';
    configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
    configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';
    usersService.findCredentialsByUsername.mockResolvedValue(null);

    await expect(
      service.loginWithSession(
        { username: 'missing', password: 'Password1' },
        { mode: 'refresh-v1', origin: 'https://app.example.test' },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(sessionsService.createSession).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('does not issue credentials when session persistence fails', async () => {
    configValues.AUTH_SESSION_MODE_ENABLED = 'true';
    configValues.AUTH_SESSION_APP_ORIGIN = 'https://app.example.test';
    configValues.AUTH_SESSION_WIKI_ORIGIN = 'https://wiki.example.test';
    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
        role: ValidRoles.user,
      }),
    );
    usersService.findIdentityById.mockResolvedValue({
      id: 'user-1',
      role: ValidRoles.user,
      isActive: true,
    });
    sessionsService.createSession.mockRejectedValue(
      new Error('database error'),
    );

    await expect(
      service.loginWithSession(
        { username: 'listener', password: 'Password1' },
        { mode: 'refresh-v1', origin: 'https://app.example.test' },
      ),
    ).rejects.toThrow('database error');
    expect(jwtService.sign).not.toHaveBeenCalled();
    expect(usersService.recordLogin).not.toHaveBeenCalled();
  });
});
