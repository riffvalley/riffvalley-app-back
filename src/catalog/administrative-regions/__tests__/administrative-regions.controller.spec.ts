import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { AdministrativeRegionsController } from '../administrative-regions.controller';

describe('AdministrativeRegionsController permissions', () => {
  const method = (name: keyof AdministrativeRegionsController) =>
    AdministrativeRegionsController.prototype[name];

  it('exposes public catalog reads', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdministrativeRegionsController),
    ).toBe('administrative-regions');
    expect(Reflect.getMetadata(PATH_METADATA, method('findAll'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, method('findAll'))).toBe(0);
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, method('findAll')),
    ).toBeUndefined();
  });

  it('protects create and update with the existing riffvalley role', () => {
    for (const name of ['create', 'update'] as const) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, method(name))).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toContain(
        UserRoleGuard,
      );
    }
  });
});
