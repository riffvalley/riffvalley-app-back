import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { ToursController } from '../tours.controller';

describe('ToursController routes and permissions', () => {
  it('exposes public paginated reads and protects writes with riffvalley', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ToursController)).toBe('tours');
    for (const name of ['findAll', 'findOne'] as const)
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, ToursController.prototype[name]),
      ).toBeUndefined();

    for (const name of ['create', 'update', 'remove'] as const) {
      const handler = ToursController.prototype[name];
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        UserRoleGuard,
      );
    }
    expect(
      Reflect.getMetadata(METHOD_METADATA, ToursController.prototype.findAll),
    ).toBe(0);
    expect(
      Reflect.getMetadata(METHOD_METADATA, ToursController.prototype.create),
    ).toBe(1);
  });
});
