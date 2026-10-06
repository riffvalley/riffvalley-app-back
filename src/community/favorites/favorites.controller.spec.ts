import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { FavoritesController } from './favorites.controller';

describe('FavoritesController access policy', () => {
  it('requires authentication for personal reads and writes', () => {
    const routes = [
      ['findAll', RequestMethod.GET, '/', true],
      ['create', RequestMethod.POST, '/', true],
      ['findOne', RequestMethod.GET, ':id', true],
      ['remove', RequestMethod.DELETE, ':id', true],
    ] as const;

    for (const [name, method, path, authenticated] of routes) {
      const handler = FavoritesController.prototype[name];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as Function[] | undefined;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(guards)).toBe(authenticated);
      if (authenticated) {
        expect(guards).toHaveLength(2);
        expect(typeof guards[0].prototype.canActivate).toBe('function');
        expect(guards).toContain(UserRoleGuard);
        expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([]);
      }
    }
  });
});
