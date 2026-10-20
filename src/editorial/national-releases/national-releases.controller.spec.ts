import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { NationalReleasesController } from './national-releases.controller';

describe('NationalReleasesController authorization metadata', () => {
  const handler = (method: keyof typeof NationalReleasesController.prototype) =>
    NationalReleasesController.prototype[method];

  it('restricts the six role-protected operations only to riffvalley', () => {
    const protectedRoutes = [
      ['createFromDisc', 1, 'from-disc'],
      ['createBulk', 1, 'bulk'],
      ['findAllAdmin', 0, 'all'],
      ['linkDisc', 4, ':id/link-disc'],
      ['update', 4, ':id'],
      ['remove', 3, ':id'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, NationalReleasesController)).toBe(
      'national-releases',
    );
    for (const [methodName, httpMethod, path] of protectedRoutes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        httpMethod,
      );
      expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe(path);
      const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler);
      expect(minimumRole).toBe(ValidRoles.riffvalley);
      expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
      expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(
        false,
      );
      expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
      expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, routeHandler)).toContain(
        UserRoleGuard,
      );
    }
  });

  it('keeps general creation throttled and public reads without role filters', () => {
    const createHandler = handler('create');
    expect(Reflect.getMetadata(METHOD_METADATA, createHandler)).toBe(1);
    expect(Reflect.getMetadata(PATH_METADATA, createHandler)).toBe('/');
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, createHandler),
    ).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, createHandler)).toEqual([
      ThrottlerGuard,
    ]);

    for (const methodName of ['findAll', 'findAllPublic', 'findOne'] as const) {
      const routeHandler = handler(methodName);
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, routeHandler),
      ).toBeUndefined();
    }
  });
});
