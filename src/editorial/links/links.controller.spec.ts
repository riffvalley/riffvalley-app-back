import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { LinksController } from './links.controller';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

describe('LinksController route and authorization metadata', () => {
  const handler = (method: keyof typeof LinksController.prototype) =>
    LinksController.prototype[method] as Function;

  it('preserves the links HTTP routes', () => {
    const routes = [
      ['create', 1, '/'],
      ['findAll', 0, '/'],
      ['findOne', 0, ':id'],
      ['update', 4, ':id'],
      ['remove', 3, ':id'],
      ['findByListId', 0, 'list/:listId'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, LinksController)).toBe('links');
    for (const [methodName, httpMethod, path] of routes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        httpMethod,
      );
      expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe(path);
    }
  });

  it('keeps link creation authenticated and reads public', () => {
    const create = handler('create');
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, create)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, create)).toContain(
      UserRoleGuard,
    );

    for (const methodName of ['findAll', 'findOne', 'findByListId'] as const) {
      const routeHandler = handler(methodName);
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, routeHandler),
      ).toBeUndefined();
    }
  });

  it('keeps link update and deletion restricted to riffvalley', () => {
    for (const methodName of ['update', 'remove'] as const) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, routeHandler)).toContain(
        UserRoleGuard,
      );
    }
  });
});
