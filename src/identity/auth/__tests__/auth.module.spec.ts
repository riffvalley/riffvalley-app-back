import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { ActivityModule } from '../../activity/activity.module';
import { AuthorizationModule } from '../../authorization/authorization.module';
import { UsersModule } from '../../users/users.module';
import { AuthController } from '../auth.controller';
import { AuthModule } from '../auth.module';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { UserAccessLog } from '../entities/user-access-log.entity';

describe('AuthModule composition', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const repositories = [User, UserAccessLog, Rate];
    const builder = Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(ConfigService)
      .useValue({ get: () => 'auth-module-test-secret' });

    for (const entity of repositories) {
      builder.overrideProvider(getRepositoryToken(entity)).useValue({});
    }

    moduleRef = await builder.compile();
  });

  afterAll(async () => moduleRef?.close());

  it('wires authentication, Users, Activity and Authorization without owning repositories', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AuthModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule) as
      | unknown[]
      | undefined;

    expect(imports).toEqual(
      expect.arrayContaining([
        UsersModule,
        ActivityModule,
        AuthorizationModule,
      ]),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ module: JwtModule }),
    );
    expect(
      imports.some(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          'module' in entry &&
          entry.module === TypeOrmModule,
      ),
    ).toBe(false);
    expect(exports).toBeUndefined();
  });

  it('resolves the compatibility controller and the authentication service', () => {
    expect(moduleRef.get(AuthController)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
  });

  it('preserves the eight hour access token expiry', () => {
    const jwtOptions = moduleRef.get<{
      signOptions?: { expiresIn?: string };
    }>('JWT_MODULE_OPTIONS');

    expect(jwtOptions.signOptions?.expiresIn).toBe('8h');
  });
});
