import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { ToursController } from '../tours.controller';
import { ResolveToursBatchDto } from '../dto/resolve-tours-batch.dto';

describe('ToursController routes and permissions', () => {
  it('validates the batch name limit and rejects oversized or invalid names', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const transform = (names: string[]) =>
      pipe.transform(
        { names },
        { type: 'body', metatype: ResolveToursBatchDto },
      );

    await expect(
      transform(Array.from({ length: 100 }, (_, index) => `Tour ${index}`)),
    ).resolves.toBeInstanceOf(ResolveToursBatchDto);
    await expect(
      transform(Array.from({ length: 101 }, (_, index) => `Tour ${index}`)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(transform(['  '])).rejects.toMatchObject({ status: 400 });
    await expect(transform(['x'.repeat(181)])).rejects.toMatchObject({
      status: 400,
    });
  });

  it('exposes public paginated reads and protects writes with riffvalley', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ToursController)).toBe('tours');
    for (const name of ['findAll', 'findOne'] as const)
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, ToursController.prototype[name]),
      ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        ToursController.prototype.resolveBatch,
      ),
    ).toBe('resolve-batch');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        ToursController.prototype.resolveBatch,
      ),
    ).toBe(1);
    expect(
      Reflect.getMetadata(
        META_MINIMUM_ROLE,
        ToursController.prototype.resolveBatch,
      ),
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
import { ValidationPipe } from '@nestjs/common';
