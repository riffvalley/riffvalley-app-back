import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { EventsController } from '../events.controller';

describe('EventsController routes and permissions', () => {
  it('exposes public paginated reads and protects all writes with riffvalley', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EventsController)).toBe('events');
    for (const name of ['findAll', 'findOne'] as const) {
      expect(
        Reflect.getMetadata(
          META_MINIMUM_ROLE,
          EventsController.prototype[name],
        ),
      ).toBeUndefined();
    }
    for (const name of [
      'create',
      'update',
      'updateArtistTour',
      'remove',
    ] as const) {
      const handler = EventsController.prototype[name];
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        UserRoleGuard,
      );
    }
    expect(
      Reflect.getMetadata(METHOD_METADATA, EventsController.prototype.create),
    ).toBe(1);
    expect(
      Reflect.getMetadata(PATH_METADATA, EventsController.prototype.findAll),
    ).toBe('/');
  });

  it('routes individual festival performance updates by both UUIDs', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        EventsController.prototype.updateArtistTour,
      ),
    ).toBe(':eventId/artists/:eventArtistId');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        EventsController.prototype.updateArtistTour,
      ),
    ).toBe(4);
  });
});
