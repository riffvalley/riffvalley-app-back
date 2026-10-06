import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CatalogImportController } from 'src/catalog/import/manual/controller/catalog-import.controller';
import { ExcelController } from 'src/catalog/import/excel/controller/excel.controller';
import {
  META_ROLES,
  RoleProtected,
} from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from './user-role.guard';
import { ValidRoles } from '../../interfaces/valid-roles';

@RoleProtected(ValidRoles.admin)
class HandlerOverridesController {
  @RoleProtected(ValidRoles.riffValley)
  handle() {}
}

class UnprotectedController {
  handle() {}
}

describe('UserRoleGuard', () => {
  let guard: UserRoleGuard;
  let userRepository: { findOne: jest.Mock };

  const contextFor = (
    controller: Function,
    handler: Function,
    request: {
      user?: { id?: string; username?: string } | null;
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
    guard = new UserRoleGuard(
      new Reflector(),
      userRepository as never,
    );
  });

  it.each([ValidRoles.admin, ValidRoles.superUser])(
    'uses controller metadata for the manual import role %s',
    async (role) => {
      const handler = CatalogImportController.prototype.processManualData;
      const context = contextFor(CatalogImportController, handler);
      userRepository.findOne.mockResolvedValue({ roles: [role] });

      expect(Reflect.getMetadata(META_ROLES, handler)).toBeUndefined();
      expect(Reflect.getMetadata(META_ROLES, CatalogImportController)).toEqual([
        ValidRoles.admin,
        ValidRoles.superUser,
      ]);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: ['roles'],
      });
    },
  );

  it('rejects a manual import user without either controller role', async () => {
    userRepository.findOne.mockResolvedValue({ roles: [ValidRoles.riffValley] });
    const context = contextFor(
      CatalogImportController,
      CatalogImportController.prototype.processManualData,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a request without a user with the controlled user-not-found exception', async () => {
    const context = contextFor(
      CatalogImportController,
      CatalogImportController.prototype.processManualData,
      {},
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new BadRequestException('User not found'),
    );
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects a request user without an id before querying the repository', async () => {
    const context = contextFor(
      CatalogImportController,
      CatalogImportController.prototype.processManualData,
      { user: { username: 'test-user' } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new BadRequestException('User not found'),
    );
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([null, undefined])(
    'rejects when the repository returns %s with the controlled user-not-found exception',
    async (repositoryUser) => {
      userRepository.findOne.mockResolvedValue(repositoryUser);
      const context = contextFor(
        CatalogImportController,
        CatalogImportController.prototype.processManualData,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: ['roles'],
      });
    },
  );

  it.each([undefined, null])(
    'rejects a recovered user with missing roles (%s) as unauthorized',
    async (roles) => {
      userRepository.findOne.mockResolvedValue({ roles });
      const context = contextFor(
        CatalogImportController,
        CatalogImportController.prototype.processManualData,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('User test-user is not authorized'),
      );
    },
  );

  it.each([
    ['download', ExcelController.prototype.downloadTemplate],
    ['upload', ExcelController.prototype.uploadTemplate],
  ])(
    'uses handler metadata for the Excel %s route',
    async (_route, handler) => {
      const roles = [
        ValidRoles.riffValley,
        ValidRoles.admin,
        ValidRoles.superUser,
      ];
      expect(Reflect.getMetadata(META_ROLES, handler)).toEqual(roles);

      for (const role of roles) {
        userRepository.findOne.mockResolvedValue({ roles: [role] });
        await expect(
          guard.canActivate(contextFor(ExcelController, handler)),
        ).resolves.toBe(true);
      }
      expect(userRepository.findOne).toHaveBeenCalledTimes(roles.length);
    },
  );

  it('uses handler roles instead of combining them with controller roles', async () => {
    userRepository.findOne.mockResolvedValue({ roles: [ValidRoles.admin] });
    const context = contextFor(
      HandlerOverridesController,
      HandlerOverridesController.prototype.handle,
    );

    expect(
      Reflect.getMetadata(
        META_ROLES,
        HandlerOverridesController.prototype.handle,
      ),
    ).toEqual([ValidRoles.riffValley]);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    userRepository.findOne.mockResolvedValue({ roles: [ValidRoles.riffValley] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows requests when neither handler nor controller defines roles', async () => {
    const handler = UnprotectedController.prototype.handle;
    const context = contextFor(UnprotectedController, handler);

    expect(Reflect.getMetadata(META_ROLES, handler)).toBeUndefined();
    expect(Reflect.getMetadata(META_ROLES, UnprotectedController)).toBeUndefined();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });
});
