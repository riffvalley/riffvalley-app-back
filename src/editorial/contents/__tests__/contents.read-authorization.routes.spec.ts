import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DiscLinkMaintenanceService } from 'src/catalog/discs/maintenance/disc-link-maintenance.service';
import { JwtStrategy } from 'src/identity/auth/strategies/jwt.strategy';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { UsersService } from 'src/identity/users/users.service';
import { ContentsController } from '../contents.controller';
import { ContentsService } from '../contents.service';

describe('ContentsController read authentication', () => {
  let app: INestApplication;
  const contentsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByMonth: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ContentsController],
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'contents-read-auth-test-secret' }),
      ],
      providers: [
        { provide: ContentsService, useValue: contentsService },
        {
          provide: DiscLinkMaintenanceService,
          useValue: { checkMissingSpotifyLinks: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn(), findIdentityById: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: () => 'contents-read-auth-test-secret' },
        },
        JwtStrategy,
        UserRoleGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    '/api/contents',
    '/api/contents/content-id',
    '/api/contents/by-month?year=2026&month=10',
  ])(
    'rejects anonymous reads at %s before invoking ContentsService',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);

      expect(contentsService.findAll).not.toHaveBeenCalled();
      expect(contentsService.findOne).not.toHaveBeenCalled();
      expect(contentsService.findByMonth).not.toHaveBeenCalled();
    },
  );
});
