import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import {
  META_MINIMUM_ROLE,
  RoleProtected,
} from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from '../user-role.guard';
import {
  isValidRole,
  roleMeetsMinimum,
  ValidRoles,
} from '../../../interfaces/valid-roles';
import { UsersService } from '../../../../users/users.service';

class AuthenticatedController {
  @Auth()
  authenticatedOnly() {}
}

class MinimumRoleController {
  @Auth(ValidRoles.user)
  user() {}

  @Auth(ValidRoles.collaborator)
  collaborator() {}

  @Auth(ValidRoles.riffvalley)
  riffvalley() {}

  @Auth(ValidRoles.superadmin)
  superadmin() {}
}

@RoleProtected(ValidRoles.superadmin)
class HandlerOverridesController {
  @RoleProtected(ValidRoles.riffvalley)
  handle() {}
}

class InvalidMetadataController {
  handle() {}
}

class UnprotectedController {
  handle() {}
}

type ControllerConstructor = new (...args: never[]) => object;
type RouteHandler = (...args: never[]) => unknown;

describe('role hierarchy', () => {
  it('defines only the four canonical role names', () => {
    expect(Object.values(ValidRoles)).toEqual([
      'user',
      'collaborator',
      'riffvalley',
      'superadmin',
    ]);
  });

  it.each([
    [ValidRoles.user, ValidRoles.user, true],
    [ValidRoles.collaborator, ValidRoles.user, true],
    [ValidRoles.riffvalley, ValidRoles.user, true],
    [ValidRoles.superadmin, ValidRoles.user, true],
    [ValidRoles.collaborator, ValidRoles.collaborator, true],
    [ValidRoles.riffvalley, ValidRoles.collaborator, true],
    [ValidRoles.superadmin, ValidRoles.collaborator, true],
    [ValidRoles.riffvalley, ValidRoles.riffvalley, true],
    [ValidRoles.superadmin, ValidRoles.riffvalley, true],
    [ValidRoles.superadmin, ValidRoles.superadmin, true],
    [ValidRoles.user, ValidRoles.collaborator, false],
    [ValidRoles.user, ValidRoles.riffvalley, false],
    [ValidRoles.collaborator, ValidRoles.riffvalley, false],
    [ValidRoles.riffvalley, ValidRoles.superadmin, false],
  ])('checks %s against minimum %s', (role, minimum, expected) => {
    expect(roleMeetsMinimum(role, minimum)).toBe(expected);
  });

  it.each(['admin', 'riffValley', '', null, undefined, 5])(
    'rejects unknown role %s',
    (role) => {
      expect(isValidRole(role)).toBe(false);
      expect(roleMeetsMinimum(role, ValidRoles.user)).toBe(false);
    },
  );
});

describe('UserRoleGuard', () => {
  let guard: UserRoleGuard;
  let usersService: Pick<UsersService, 'findIdentityById'>;
  let findIdentityById: jest.MockedFunction<
    (
      id: string,
    ) => Promise<{ id: string; role: unknown; isActive: boolean } | null>
  >;

  const contextFor = (
    controller: ControllerConstructor,
    handler: RouteHandler,
    request: {
      user?: { id?: string; username?: string; role?: unknown } | null;
    } = { user: { id: 'user-id', username: 'test-user' } },
  ): ExecutionContext =>
    new ExecutionContextHost([request], controller, handler);

  beforeEach(() => {
    findIdentityById = jest.fn();
    usersService = { findIdentityById: findIdentityById as never };
    guard = new UserRoleGuard(new Reflector(), usersService as never);
  });

  it('allows authenticated-only routes without reading the persisted role', async () => {
    const handler = AuthenticatedController.prototype.authenticatedOnly;
    const context = contextFor(AuthenticatedController, handler);

    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', handler)).toHaveLength(2);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usersService.findIdentityById).not.toHaveBeenCalled();
  });

  it.each([
    [ValidRoles.user, [ValidRoles.user]],
    [ValidRoles.collaborator, [ValidRoles.user, ValidRoles.collaborator]],
    [
      ValidRoles.riffvalley,
      [ValidRoles.user, ValidRoles.collaborator, ValidRoles.riffvalley],
    ],
    [ValidRoles.superadmin, Object.values(ValidRoles)],
  ])(
    'allows persisted %s to satisfy each applicable minimum',
    async (role, minimums) => {
      findIdentityById.mockResolvedValue({
        id: 'user-id',
        role,
        isActive: true,
      });

      for (const minimumRole of minimums) {
        const handler = MinimumRoleController.prototype[minimumRole];
        await expect(
          guard.canActivate(contextFor(MinimumRoleController, handler)),
        ).resolves.toBe(true);
      }
    },
  );

  it.each([
    [ValidRoles.user, ValidRoles.collaborator],
    [ValidRoles.user, ValidRoles.riffvalley],
    [ValidRoles.user, ValidRoles.superadmin],
    [ValidRoles.collaborator, ValidRoles.riffvalley],
    [ValidRoles.collaborator, ValidRoles.superadmin],
    [ValidRoles.riffvalley, ValidRoles.superadmin],
  ])('denies %s below minimum %s', async (role, minimumRole) => {
    const handler = MinimumRoleController.prototype[minimumRole];
    findIdentityById.mockResolvedValue({
      id: 'user-id',
      role,
      isActive: true,
    });

    await expect(
      guard.canActivate(contextFor(MinimumRoleController, handler)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows superadmin to satisfy every minimum', async () => {
    findIdentityById.mockResolvedValue({
      id: 'user-id',
      role: ValidRoles.superadmin,
      isActive: true,
    });

    for (const minimumRole of Object.values(ValidRoles)) {
      const handler = MinimumRoleController.prototype[minimumRole];
      await expect(
        guard.canActivate(contextFor(MinimumRoleController, handler)),
      ).resolves.toBe(true);
    }
  });

  it.each(['admin', 'riffValley', '', null, undefined])(
    'denies invalid persisted role %s',
    async (role) => {
      const handler = MinimumRoleController.prototype.riffvalley;
      findIdentityById.mockResolvedValue({
        id: 'user-id',
        role,
        isActive: true,
      });

      await expect(
        guard.canActivate(contextFor(MinimumRoleController, handler)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('reads the persisted singular role and ignores role claims in the JWT', async () => {
    const handler = MinimumRoleController.prototype.riffvalley;
    findIdentityById.mockResolvedValue({
      id: 'user-id',
      role: ValidRoles.collaborator,
      isActive: true,
    });
    const context = contextFor(MinimumRoleController, handler, {
      user: {
        id: 'user-id',
        username: 'test-user',
        role: ValidRoles.superadmin,
      },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findIdentityById).toHaveBeenCalledWith('user-id');
  });

  it('denies invalid minimum metadata', async () => {
    Reflect.defineMetadata(
      META_MINIMUM_ROLE,
      'admin',
      InvalidMetadataController.prototype.handle,
    );
    await expect(
      guard.canActivate(
        contextFor(
          InvalidMetadataController,
          InvalidMetadataController.prototype.handle,
        ),
      ),
    ).rejects.toThrow(new ForbiddenException('Invalid minimum role'));
    expect(findIdentityById).not.toHaveBeenCalled();
  });

  it('denies a missing or unidentified request user', async () => {
    const handler = MinimumRoleController.prototype.riffvalley;
    await expect(
      guard.canActivate(
        contextFor(MinimumRoleController, handler, { user: undefined }),
      ),
    ).rejects.toThrow(new BadRequestException('User not found'));
    await expect(
      guard.canActivate(
        contextFor(MinimumRoleController, handler, {
          user: { username: 'test-user' },
        }),
      ),
    ).rejects.toThrow(new BadRequestException('User not found'));
    expect(findIdentityById).not.toHaveBeenCalled();
  });

  it('denies when PostgreSQL no longer has the authenticated user', async () => {
    const handler = MinimumRoleController.prototype.riffvalley;
    findIdentityById.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor(MinimumRoleController, handler)),
    ).rejects.toThrow(new BadRequestException('User not found'));
  });

  it('allows routes without role metadata and honors handler metadata precedence', async () => {
    const unprotectedHandler = UnprotectedController.prototype.handle;
    await expect(
      guard.canActivate(contextFor(UnprotectedController, unprotectedHandler)),
    ).resolves.toBe(true);
    expect(findIdentityById).not.toHaveBeenCalled();

    findIdentityById.mockResolvedValue({
      id: 'user-id',
      role: ValidRoles.riffvalley,
      isActive: true,
    });
    await expect(
      guard.canActivate(
        contextFor(
          HandlerOverridesController,
          HandlerOverridesController.prototype.handle,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a user deactivated after the JWT strategy authenticated them', async () => {
    findIdentityById.mockResolvedValue({
      id: 'user-id',
      role: ValidRoles.superadmin,
      isActive: false,
    });

    await expect(
      guard.canActivate(
        contextFor(
          MinimumRoleController,
          MinimumRoleController.prototype.superadmin,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
