import { MODULE_METADATA } from '@nestjs/common/constants';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module';
import { AuthorizationModule } from '../authorization.module';
import { UserRoleGuard } from '../guards/user-role/user-role.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { UsersModule } from '../../users/users.module';

describe('Authorization module ownership and compatibility', () => {
  it('owns and exports JWT strategy, role guard, and Passport support', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AuthorizationModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AuthorizationModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      AuthorizationModule,
    ) as unknown[];

    expect(imports).toContain(UsersModule);
    expect(providers).toEqual(
      expect.arrayContaining([JwtStrategy, UserRoleGuard]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        JwtStrategy,
        UserRoleGuard,
        PassportModule,
        UsersModule,
      ]),
    );
    expect(imports).not.toContain(AuthModule);
  });

  it('is imported internally by Auth without exporting its providers back', () => {
    const authImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AuthModule,
    ) as unknown[];
    const authExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      AuthModule,
    ) as unknown[] | undefined;
    const authProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AuthModule,
    ) as unknown[];

    expect(authImports).toContain(AuthorizationModule);
    expect(authExports).toBeUndefined();
    expect(authProviders).not.toContain(JwtStrategy);
    expect(authProviders).not.toContain(UserRoleGuard);
  });
});
