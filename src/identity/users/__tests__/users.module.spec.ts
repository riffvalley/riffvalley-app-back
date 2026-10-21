import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../../auth/auth.module';
import { AccessRequestsModule } from '../../access-requests/access-requests.module';
import { UsersModule } from '../users.module';
import { UsersService } from '../users.service';

describe('UsersModule dependency wiring', () => {
  it('is imported by Auth and AccessRequests without importing either back', () => {
    const authImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AuthModule,
    ) as unknown[];
    const accessRequestsImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AccessRequestsModule,
    ) as unknown[];
    const usersImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      UsersModule,
    ) as unknown[];

    expect(authImports).toContain(UsersModule);
    expect(accessRequestsImports).toContain(UsersModule);
    expect(usersImports).not.toContain(AuthModule);
    expect(usersImports).not.toContain(AccessRequestsModule);
  });

  it('exports UsersService but not a TypeORM repository module', () => {
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      UsersModule,
    ) as unknown[] | undefined;

    expect(exports).toEqual([UsersService]);
  });
});
