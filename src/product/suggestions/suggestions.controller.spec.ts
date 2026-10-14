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
import { SuggestionsController } from './suggestions.controller';

describe('SuggestionsController authorization metadata', () => {
  const handler = (method: keyof typeof SuggestionsController.prototype) =>
    SuggestionsController.prototype[method] as Function;

  it('restricts management endpoints only to riffvalley', () => {
    const roleProtectedRoutes = [
      ['findAll', 'GET', '/'],
      ['findOne', 'GET', ':id'],
      ['setInProgress', 'PATCH', ':id/progress'],
      ['reject', 'PATCH', ':id/reject'],
      ['markDone', 'PATCH', ':id/done'],
      ['markRead', 'PATCH', ':id/read'],
      ['remove', 'DELETE', ':id'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, SuggestionsController)).toBe(
      'suggestions',
    );
    for (const [methodName, httpMethod, path] of roleProtectedRoutes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        { GET: 0, PATCH: 4, DELETE: 3 }[httpMethod],
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

  it('keeps create, mine, and update authenticated without a role filter', () => {
    const authenticatedRoutes = [
      ['create', 'POST', '/'],
      ['findMine', 'GET', 'my'],
      ['update', 'PATCH', ':id'],
    ] as const;

    for (const [methodName, httpMethod, path] of authenticatedRoutes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        { GET: 0, POST: 1, PATCH: 4 }[httpMethod],
      );
      expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe(path);
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler),
      ).toBeUndefined();
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        routeHandler,
      ) as Function[];
      expect(guards).toHaveLength(2);
      expect(guards).toContain(UserRoleGuard);
    }
  });
});
