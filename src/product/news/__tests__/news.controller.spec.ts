import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { NewsController } from '../news.controller';

describe('NewsController authorization metadata', () => {
  const handler = (method: keyof typeof NewsController.prototype) =>
    NewsController.prototype[method];

  it('restricts news creation, update, and deletion to superadmin', () => {
    const protectedRoutes = [
      ['create', 1, '/'],
      ['update', 4, ':id'],
      ['remove', 3, ':id'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, NewsController)).toBe('news');
    for (const [methodName, httpMethod, path] of protectedRoutes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        httpMethod,
      );
      expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe(path);
      const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler);
      expect(minimumRole).toBe(ValidRoles.superadmin);
      expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
      expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(
        false,
      );
      expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(false);
      expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, routeHandler)).toContain(
        UserRoleGuard,
      );
    }
  });

  it('keeps news reads public', () => {
    const publicRoutes = [
      'findAll',
      'getFeed',
      'getSourceFeed',
      'findOne',
    ] as const;

    for (const methodName of publicRoutes) {
      const routeHandler = handler(methodName);
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, routeHandler),
      ).toBeUndefined();
    }

    expect(NewsController.prototype.getFeed).toHaveLength(0);
  });
});
