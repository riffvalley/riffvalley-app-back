import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { ActivityModule } from '../../activity/activity.module';
import { AuthorizationModule } from '../../authorization/authorization.module';
import { UsersModule } from '../../users/users.module';
import { AuthController } from '../auth.controller';
import { AuthModule } from '../auth.module';
import { AuthService } from '../auth.service';
import { MailModule } from 'src/communications/mail/mail.module';
import { User } from '../entities/user.entity';
import { UserAccessLog } from '../entities/user-access-log.entity';
import { UserAppDailyActivity } from '../../activity/entities/user-app-daily-activity.entity';
import { RateVoteEvent } from '../../../community/rates/entities/rate-vote-event.entity';
import { AuthSession } from '../../sessions/entities/auth-session.entity';
import { AuthRefreshToken } from '../../sessions/entities/auth-refresh-token.entity';
import { SessionsModule } from '../../sessions/sessions.module';

describe('AuthModule composition', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const repositories = [
      User,
      UserAccessLog,
      UserAppDailyActivity,
      RateVoteEvent,
      Rate,
      AuthSession,
      AuthRefreshToken,
    ];
    const builder = Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          key === 'JWT_SECRET' ? 'auth-module-test-secret' : undefined,
      })
      .useMocker((token) => (token === DataSource ? {} : undefined));

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
        SessionsModule,
        MailModule,
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

  it('preserves the eight hour JWT default used by account registration', () => {
    const jwtOptions = moduleRef.get<{
      signOptions?: { expiresIn?: string };
    }>('JWT_MODULE_OPTIONS');

    expect(jwtOptions.signOptions?.expiresIn).toBe('8h');
  });

  it('wires Sessions inward without exposing a new HTTP route', () => {
    expect(Reflect.getMetadata('path', AuthController)).toBe('auth');
    expect(Reflect.getMetadata('path', AuthController.prototype.login)).toBe(
      'login',
    );
    expect(Reflect.getMetadata('path', AuthController.prototype.create)).toBe(
      'register',
    );
    expect(moduleRef.get(AuthService)).toBeDefined();
  });
});
