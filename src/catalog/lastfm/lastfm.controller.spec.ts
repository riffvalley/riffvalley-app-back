import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { roleMeetsMinimum, ValidRoles } from 'src/auth/interfaces/valid-roles';
import { LastfmController } from './lastfm.controller';

describe('LastfmController authorization metadata', () => {
  it('restricts fill-images to superadmin and leaves artist reads public', () => {
    const fillImages = LastfmController.prototype.fillWeeklyImages;
    const artistRead = LastfmController.prototype.getArtistInfo;

    expect(Reflect.getMetadata(PATH_METADATA, LastfmController)).toBe('lastfm');
    expect(Reflect.getMetadata(PATH_METADATA, fillImages)).toBe('fill-images');
    expect(Reflect.getMetadata(METHOD_METADATA, fillImages)).toBe(
      RequestMethod.POST,
    );
    const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, fillImages);
    expect(minimumRole).toBe(ValidRoles.superadmin);
    expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, fillImages)).toContain(
      UserRoleGuard,
    );

    expect(Reflect.getMetadata(PATH_METADATA, artistRead)).toBe('artist');
    expect(Reflect.getMetadata(METHOD_METADATA, artistRead)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, artistRead)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, artistRead)).toBeUndefined();
  });
});
