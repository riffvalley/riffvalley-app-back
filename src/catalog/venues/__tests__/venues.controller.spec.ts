import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { VenuesController } from '../venues.controller';
import { LocalitiesController } from '../localities/localities.controller';

describe('VenuesController routes and permissions', () => {
  const method = (name: keyof VenuesController) =>
    VenuesController.prototype[name];

  it('exposes the catalog and map as read routes without a write-role requirement', () => {
    expect(Reflect.getMetadata(PATH_METADATA, VenuesController)).toBe('venues');
    expect(Reflect.getMetadata(PATH_METADATA, method('findAll'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, method('findAll'))).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, method('findMap'))).toBe('map');
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, method('findAll')),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, method('findMap')),
    ).toBeUndefined();
  });

  it('requires riffvalley role for venue mutations', () => {
    for (const name of ['create', 'importBatch', 'update', 'remove'] as const) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, method(name))).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toContain(
        UserRoleGuard,
      );
    }
    expect(Reflect.getMetadata(PATH_METADATA, method('importBatch'))).toBe(
      'import-batch',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, method('importBatch'))).toBe(1);
  });

  it('protects locality resolution and keeps venue resolution as a read operation', () => {
    const resolveLocality = LocalitiesController.prototype.resolve;
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, resolveLocality)).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(PATH_METADATA, method('resolveBatch'))).toBe(
      'resolve-batch',
    );
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, method('resolveBatch')),
    ).toBeUndefined();
  });

  it('requires riffvalley for manual locality alias changes', () => {
    const addAlias = LocalitiesController.prototype.addAlias;
    const removeAlias = LocalitiesController.prototype.removeAlias;
    for (const handler of [addAlias, removeAlias]) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        UserRoleGuard,
      );
    }
    expect(Reflect.getMetadata(PATH_METADATA, addAlias)).toBe(':id/aliases');
    expect(Reflect.getMetadata(METHOD_METADATA, addAlias)).toBe(1);
    expect(Reflect.getMetadata(PATH_METADATA, removeAlias)).toBe(
      ':id/aliases/:aliasId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, removeAlias)).toBe(3);
  });
});
