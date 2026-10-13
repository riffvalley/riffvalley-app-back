import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Auth } from 'src/auth/decorators/auth.decorator';
import {
  META_MINIMUM_ROLE,
  RoleProtected,
} from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from './user-role.guard';
import {
  isValidRole,
  roleMeetsMinimum,
  ValidRoles,
} from '../../interfaces/valid-roles';

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
  @RoleProtected('admin' as ValidRoles)
  handle() {}
}

class UnprotectedController {
  handle() {}
}

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
  let userRepository: { findOne: jest.Mock };

  const contextFor = (
    controller: Function,
    handler: Function,
    request: {
      user?: { id?: string; username?: string; role?: unknown } | null;
    } = { user: { id: 'user-id', username: 'test-user' } },
  ): ExecutionContext =>
    ({
      getClass: () => controller,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    userRepository = { findOne: jest.fn() };
    guard = new UserRoleGuard(new Reflector(), userRepository as never);
  });

  it('allows authenticated-only routes without reading the persisted role', async () => {
    const handler = AuthenticatedController.prototype.authenticatedOnly;
    const context = contextFor(AuthenticatedController, handler);

    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', handler)).toHaveLength(2);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(userRepository.findOne).not.toHaveBeenCalled();
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
      userRepository.findOne.mockResolvedValue({ role });

      for (const minimumRole of minimums) {
        const handler = MinimumRoleController.prototype[minimumRole];
        await expect(
          guard.canActivate(
            contextFor(MinimumRoleController, handler as Function),
          ),
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
    userRepository.findOne.mockResolvedValue({ role });

    await expect(
      guard.canActivate(contextFor(MinimumRoleController, handler as Function)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows superadmin to satisfy every minimum', async () => {
    userRepository.findOne.mockResolvedValue({ role: ValidRoles.superadmin });

    for (const minimumRole of Object.values(ValidRoles)) {
      const handler = MinimumRoleController.prototype[minimumRole];
      await expect(
        guard.canActivate(
          contextFor(MinimumRoleController, handler as Function),
        ),
      ).resolves.toBe(true);
    }
  });

  it.each(['admin', 'riffValley', '', null, undefined])(
    'denies invalid persisted role %s',
    async (role) => {
      const handler = MinimumRoleController.prototype.riffvalley;
      userRepository.findOne.mockResolvedValue({ role });

      await expect(
        guard.canActivate(
          contextFor(MinimumRoleController, handler as Function),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('reads the persisted singular role and ignores role claims in the JWT', async () => {
    const handler = MinimumRoleController.prototype.riffvalley;
    userRepository.findOne.mockResolvedValue({ role: ValidRoles.collaborator });
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
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: ['role'],
    });
  });

  it('denies invalid minimum metadata', async () => {
    await expect(
      guard.canActivate(
        contextFor(
          InvalidMetadataController,
          InvalidMetadataController.prototype.handle,
        ),
      ),
    ).rejects.toThrow(new ForbiddenException('Invalid minimum role'));
    expect(userRepository.findOne).not.toHaveBeenCalled();
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
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('denies when PostgreSQL no longer has the authenticated user', async () => {
    const handler = MinimumRoleController.prototype.riffvalley;
    userRepository.findOne.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor(MinimumRoleController, handler)),
    ).rejects.toThrow(new BadRequestException('User not found'));
  });

  it('allows routes without role metadata and honors handler metadata precedence', async () => {
    const unprotectedHandler = UnprotectedController.prototype.handle;
    await expect(
      guard.canActivate(contextFor(UnprotectedController, unprotectedHandler)),
    ).resolves.toBe(true);
    expect(userRepository.findOne).not.toHaveBeenCalled();

    userRepository.findOne.mockResolvedValue({ role: ValidRoles.riffvalley });
    await expect(
      guard.canActivate(
        contextFor(
          HandlerOverridesController,
          HandlerOverridesController.prototype.handle,
        ),
      ),
    ).resolves.toBe(true);
  });
});
