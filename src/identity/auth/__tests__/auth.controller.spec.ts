import {
  GUARDS_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AuthController } from '../auth.controller';
import { META_MINIMUM_ROLE } from '../decorators/role-protected.decorator';
import { ValidRoles } from '../interfaces/valid-roles';
import { UserRoleGuard } from '../guards/user-role/user-role.guard';
import { AUTH_SESSION_MODE } from '../dto/session-auth-contract.dto';

describe('AuthController role contract', () => {
  const prototype = AuthController.prototype;

  const privateRoutes = [
    ['testingPrivateRoute', 'private', ValidRoles.superadmin],
    ['findAll', 'users', ValidRoles.superadmin],
    ['findAllAdminStats', 'users/admin-stats', ValidRoles.superadmin],
    ['getAllActivity', 'activity', ValidRoles.superadmin],
    ['updateSuperAdmin', '/superadmin/:id', ValidRoles.superadmin],
    ['deactivate', ':id/deactivate', ValidRoles.superadmin],
    ['activate', ':id/activate', ValidRoles.superadmin],
    ['remove', ':id', ValidRoles.superadmin],
  ] as const satisfies readonly (readonly [
    keyof AuthController,
    string,
    ValidRoles,
  ])[];

  it.each(privateRoutes)(
    'protects %s at /auth/%s with %s only',
    (handlerName, path, role) => {
      const handler = prototype[handlerName];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(role);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeDefined();
    },
  );

  it('preserves public registration and login routes and authenticated profile route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, prototype.create)).toBe(
      'register',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.create)).toBe(1);
    expect(Reflect.getMetadata(PATH_METADATA, prototype.login)).toBe('login');
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.login)).toBe(1);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, prototype.create),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, prototype.login),
    ).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, prototype.update)).toBe('/');
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, prototype.update),
    ).toBeUndefined();
  });

  const readRoutes = [
    ['findAllRv', 'usersRv', ValidRoles.riffvalley],
    ['findUsersByRole', 'users/role/:role', ValidRoles.superadmin],
    ['findSuperUsers', 'users/superusers', ValidRoles.superadmin],
    ['findOne', ':id', ValidRoles.superadmin],
  ] as const satisfies readonly (readonly [
    keyof AuthController,
    string,
    ValidRoles,
  ])[];

  it.each(readRoutes)(
    'protects %s at /auth/%s with minimum %s and preserves its response',
    async (handlerName, path, minimumRole) => {
      const handler = prototype[handlerName];
      const response = [{ id: 'user-2', username: 'author' }];
      const authService = {};
      const usersService = {
        findAllRv: jest.fn().mockReturnValue(response),
        findUsersByRole: jest.fn().mockReturnValue(response),
        findSuperUsers: jest.fn().mockReturnValue(response),
        findOne: jest.fn().mockReturnValue(response[0]),
      };
      const controller = new AuthController(
        authService as never,
        usersService as never,
        {} as never,
        { get: jest.fn() } as never,
        {} as never,
        {} as never,
      );

      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(minimumRole);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeDefined();

      const result =
        handlerName === 'findUsersByRole'
          ? controller.findUsersByRole(ValidRoles.user)
          : handlerName === 'findOne'
            ? controller.findOne('user-2')
            : handlerName === 'findAllRv'
              ? controller.findAllRv()
              : controller.findSuperUsers();
      expect(result).toBe(handlerName === 'findOne' ? response[0] : response);
    },
  );

  it('delegates account and activity routes to their owning services', async () => {
    const controllerMethods = Object.getOwnPropertyNames(prototype);
    expect(controllerMethods).not.toContain('getUserActivity');
    expect(
      controllerMethods.some((propertyName) => {
        const handler = prototype[propertyName as keyof AuthController];
        return (
          typeof handler === 'function' &&
          Reflect.getMetadata(PATH_METADATA, handler) === ':id/activity'
        );
      }),
    ).toBe(false);
    const pagination = { limit: 10, offset: 20 };
    const usersService = {
      findAll: jest.fn().mockResolvedValue(['users']),
      updateUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
      updateUserSuperAdmin: jest.fn().mockResolvedValue({ id: 'user-2' }),
      setActive: jest.fn().mockResolvedValue({ id: 'user-2' }),
      remove: jest.fn().mockResolvedValue({ id: 'user-2' }),
    };
    const activityService = {
      findAllAdminStats: jest.fn().mockResolvedValue({ users: [] }),
      getAllActivity: jest.fn().mockResolvedValue({ data: [] }),
    };
    const controller = new AuthController(
      {} as never,
      usersService as never,
      activityService as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    const actorId = 'actor-1';
    const actor = { id: actorId } as never;

    await expect(controller.findAll()).resolves.toEqual(['users']);
    await expect(controller.update({}, actor)).resolves.toEqual({
      id: 'user-1',
    });
    await expect(
      controller.updateSuperAdmin('user-2', {}, actor),
    ).resolves.toEqual({ id: 'user-2' });
    await expect(controller.deactivate('user-2', actor)).resolves.toEqual({
      id: 'user-2',
    });
    await expect(controller.remove('user-2', actor)).resolves.toEqual({
      id: 'user-2',
    });
    await expect(
      controller.findAllAdminStats(pagination as never),
    ).resolves.toEqual({ users: [] });
    await expect(
      controller.getAllActivity(pagination as never),
    ).resolves.toEqual({ data: [] });

    expect(usersService.updateUser).toHaveBeenCalledWith({}, actorId);
    expect(usersService.updateUserSuperAdmin).toHaveBeenCalledWith(
      'user-2',
      {},
      actorId,
    );
    expect(usersService.setActive).toHaveBeenCalledWith(
      'user-2',
      false,
      actorId,
    );
    expect(usersService.remove).toHaveBeenCalledWith('user-2', actorId);
    expect(activityService.findAllAdminStats).toHaveBeenCalledWith(pagination);
    expect(activityService.getAllActivity).toHaveBeenCalledWith(pagination);
  });

  it('keeps an explicitly negotiated session login unavailable when its gate is off', async () => {
    const authService = {
      loginWithSession: jest.fn(),
      resolveSessionLoginClient: jest.fn().mockImplementation(() => {
        throw new ServiceUnavailableException('Session login is not available');
      }),
    };
    const controller = new AuthController(
      authService as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.login(
        { username: 'listener', password: 'Password1' },
        AUTH_SESSION_MODE,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  it('keeps session login unavailable before reading request metadata when gate is off', async () => {
    const authService = {
      loginWithSession: jest.fn(),
      resolveSessionLoginClient: jest.fn().mockImplementation(() => {
        throw new ForbiddenException('Origin is not allowed');
      }),
    };
    const controller = new AuthController(
      authService as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.login(
        { username: 'listener', password: 'Password1' },
        AUTH_SESSION_MODE,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(authService.loginWithSession).not.toHaveBeenCalled();
  });

  const authorizationCases = [
    [ValidRoles.riffvalley, 'findAllRv', ValidRoles.riffvalley, true],
    [ValidRoles.superadmin, 'findAllRv', ValidRoles.riffvalley, true],
    [ValidRoles.user, 'findAllRv', ValidRoles.riffvalley, false],
    [ValidRoles.collaborator, 'findAllRv', ValidRoles.riffvalley, false],
    [ValidRoles.superadmin, 'findUsersByRole', ValidRoles.superadmin, true],
    [ValidRoles.superadmin, 'findSuperUsers', ValidRoles.superadmin, true],
    [ValidRoles.superadmin, 'findOne', ValidRoles.superadmin, true],
    [ValidRoles.user, 'findUsersByRole', ValidRoles.superadmin, false],
    [ValidRoles.collaborator, 'findSuperUsers', ValidRoles.superadmin, false],
    [ValidRoles.riffvalley, 'findOne', ValidRoles.superadmin, false],
  ] as const satisfies readonly (readonly [
    ValidRoles,
    keyof AuthController,
    ValidRoles,
    boolean,
  ])[];

  it.each(authorizationCases)(
    'authorizes persisted %s for %s at minimum %s',
    async (persistedRole, handlerName, _minimumRole, allowed) => {
      const usersService = {
        findIdentityById: jest.fn().mockResolvedValue({
          role: persistedRole,
          isActive: true,
        }),
      };
      const guard = new UserRoleGuard(new Reflector(), usersService as never);
      const context = new ExecutionContextHost(
        [{ user: { id: 'user-1', username: 'listener' } }],
        AuthController,
        prototype[handlerName],
      );

      if (allowed) {
        await expect(guard.canActivate(context)).resolves.toBe(true);
      } else {
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      }
    },
  );
});

describe('AuthController refresh rejection diagnostics', () => {
  it('logs only the safe rejection fields while preserving the 403 response', async () => {
    const requestId = 'a1234567-b123-4123-8123-a123456789ab';
    const operationId = 'b1234567-b123-4123-8123-b123456789ab';
    const csrfProof = 'eyJmb28iOiJiYXIifQ.AA';
    const refreshCookieValue = 'A'.repeat(43);
    const configValues: Record<string, string> = {
      AUTH_SESSION_MODE_ENABLED: 'true',
      AUTH_SESSION_EDGE_SECRET: Buffer.alloc(32, 42).toString('base64url'),
      JWT_SECRET: 'test-jwt-secret',
      AUTH_SESSION_APP_ORIGIN: 'https://app.riffvalley.es',
      AUTH_SESSION_WIKI_ORIGIN: 'https://wiki.riffvalley.es',
    };
    const controller = new AuthController(
      {} as never,
      {} as never,
      {} as never,
      { get: (key: string) => configValues[key] } as never,
      {
        findRefreshTokenSessionBinding: jest.fn().mockResolvedValue({
          sessionId: 'session-id',
          clientType: 'app',
        }),
      } as never,
      { consume: jest.fn().mockResolvedValue(null) } as never,
    );
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      const refresh = controller.refresh(
        AUTH_SESSION_MODE,
        operationId,
        {},
        {
          secure: true,
          socket: { remoteAddress: '127.0.0.1' },
          headers: {
            origin: 'https://app.riffvalley.es',
            'content-type': 'application/json',
            'x-request-id': requestId,
            'x-csrf-token': csrfProof,
            cookie: `__Secure-rv_app_refresh=${refreshCookieValue}`,
          },
        } as never,
        { setHeader: jest.fn() } as never,
      );
      await expect(refresh).rejects.toThrow('CSRF validation failed');
      await expect(refresh).rejects.toMatchObject({ status: 403 });

      const loggedMessage = String(warn.mock.calls[0]?.[0]);
      expect(loggedMessage).toContain('endpoint=/api/auth/refresh');
      expect(loggedMessage).toContain('status=403');
      expect(loggedMessage).toContain('reason=csrf_signature_invalid');
      expect(loggedMessage).toContain('client_type=app');
      expect(loggedMessage).toContain('occurred_at=');
      expect(loggedMessage).toContain(`request_id=${requestId}`);
      expect(loggedMessage).toContain(`operation_id=${operationId}`);
      expect(loggedMessage).not.toContain(csrfProof);
      expect(loggedMessage).not.toContain(refreshCookieValue);
    } finally {
      warn.mockRestore();
    }
  });
});
