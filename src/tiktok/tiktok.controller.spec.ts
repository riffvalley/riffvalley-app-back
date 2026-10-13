import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { roleMeetsMinimum, ValidRoles } from 'src/auth/interfaces/valid-roles';
import { TiktokController } from './tiktok.controller';

describe('TiktokController authorization metadata', () => {
  it('restricts connection operations to riffvalley and inherited superadmin access', () => {
    const routes = [
      ['connect', RequestMethod.POST, 'connect'],
      ['getConnection', RequestMethod.GET, 'connection'],
      ['disconnect', RequestMethod.DELETE, 'connection'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, TiktokController)).toBe('tiktok');
    for (const [methodName, method, path] of routes) {
      const handler = TiktokController.prototype[methodName] as Function;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, handler);
      expect(minimumRole).toBe(ValidRoles.riffvalley);
      expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
      expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(
        false,
      );
      expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
      expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        UserRoleGuard,
      );
    }
  });

  it('leaves OAuth callback and video reads public', () => {
    const publicRoutes = [
      ['callback', RequestMethod.GET, 'callback'],
      ['findVideos', RequestMethod.GET, 'videos'],
      ['findVideoDetail', RequestMethod.GET, 'videos/:tiktokVideoId'],
    ] as const;

    for (const [methodName, method, path] of publicRoutes) {
      const handler = TiktokController.prototype[methodName] as Function;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    }
  });
});
