import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { UploadsController } from './uploads.controller';

describe('UploadsController authorization metadata', () => {
  it('restricts image uploads to superadmin and keeps the file interceptor', () => {
    const handler = UploadsController.prototype.uploadImage;

    expect(Reflect.getMetadata(PATH_METADATA, UploadsController)).toBe(
      'uploads',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('image');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, handler);
    expect(minimumRole).toBe(ValidRoles.superadmin);
    expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      UserRoleGuard,
    );
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toHaveLength(1);
  });
});
