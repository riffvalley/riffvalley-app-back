import * as bcrypt from 'bcrypt';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ValidRoles } from '../interfaces/valid-roles';
import { UsersService } from '../../users/users.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ConfigService } from '@nestjs/config';

function makeUser(values: Partial<User>): User {
  return Object.assign(new User(), values);
}

describe('AuthService authentication', () => {
  const usersService = {
    createAccount: jest.fn(),
    findCredentialsByUsername: jest.fn(),
    findIdentityById: jest.fn(),
    recordLogin: jest.fn(),
  } satisfies Pick<
    UsersService,
    | 'createAccount'
    | 'findCredentialsByUsername'
    | 'findIdentityById'
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
  } satisfies Pick<SessionsService, 'createSession' | 'revokeSession'>;
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

  it('validates credentials through Users and preserves the login payload and claims', async () => {
    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
        role: ValidRoles.riffvalley,
        image: 'avatar.png',
        dashboardConfig: null,
        mobileDashboardConfig: null,
        dashboardButtonsEnabled: false,
      }),
    );

    const response = await service.login({
      username: 'listener',
      password: 'Password1',
    });

    expect(response).toMatchObject({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.riffvalley,
      image: 'avatar.png',
      token: 'signed-token',
    });
    expect(response).not.toHaveProperty('password');
    expect(usersService.recordLogin).toHaveBeenCalledWith('user-1');
    expect(jwtService.sign).toHaveBeenCalledWith({
      username: 'listener',
      id: 'user-1',
      role: ValidRoles.riffvalley,
    });
  });

  it('returns the same unauthorized response for missing users and wrong passwords', async () => {
    usersService.findCredentialsByUsername.mockResolvedValue(null);
    await expect(
      service.login({ username: 'missing', password: 'Password1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
      }),
    );
    await expect(
      service.login({ username: 'listener', password: 'WrongPass1' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(usersService.recordLogin).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
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
      { username: 'listener', id: 'user-1', role: ValidRoles.user },
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
