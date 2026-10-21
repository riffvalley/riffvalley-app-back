import { INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { NationalReleasesController } from '../national-releases.controller';
import { NationalReleasesService } from '../national-releases.service';

describe('NationalReleasesController query filters', () => {
  let app: INestApplication;
  const service = {
    findAll: jest.fn(),
    findAllPublic: jest.fn(),
    findAllAdmin: jest.fn(),
  };

  const routes = [
    { path: '/api/national-releases', find: service.findAll },
    { path: '/api/national-releases/public', find: service.findAllPublic },
    { path: '/api/national-releases/all', find: service.findAllAdmin },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    service.findAll.mockResolvedValue([]);
    service.findAllPublic.mockResolvedValue([]);
    service.findAllAdmin.mockResolvedValue({ data: [], pendingMonths: [] });

    const moduleRef = await Test.createTestingModule({
      controllers: [NationalReleasesController],
      providers: [{ provide: NationalReleasesService, useValue: service }],
    })
      .overrideGuard(AuthGuard())
      .useValue({ canActivate: () => true })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('preserves omitted filter semantics for all three routes', async () => {
    await request(app.getHttpServer()).get(routes[0].path).expect(200, []);
    await request(app.getHttpServer()).get(routes[1].path).expect(200, []);
    await request(app.getHttpServer())
      .get(routes[2].path)
      .expect(200, { data: [], pendingMonths: [] });

    expect(service.findAll).toHaveBeenCalledWith(undefined, undefined);
    expect(service.findAllPublic).toHaveBeenCalledWith(undefined, undefined);
    expect(service.findAllAdmin).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
    );
  });

  it('accepts valid month/year boundaries and literal approved values', async () => {
    await request(app.getHttpServer())
      .get(`${routes[0].path}?month=1&year=1`)
      .expect(200, []);
    await request(app.getHttpServer())
      .get(`${routes[1].path}?month=12&year=9999`)
      .expect(200, []);
    await request(app.getHttpServer())
      .get(`${routes[2].path}?month=12&year=2026&approved=false`)
      .expect(200, { data: [], pendingMonths: [] });
    await request(app.getHttpServer())
      .get(`${routes[2].path}?approved=true`)
      .expect(200, { data: [], pendingMonths: [] });

    expect(service.findAll).toHaveBeenCalledWith(1, 1);
    expect(service.findAllPublic).toHaveBeenCalledWith(12, 9999);
    expect(service.findAllAdmin).toHaveBeenNthCalledWith(1, 12, 2026, false);
    expect(service.findAllAdmin).toHaveBeenNthCalledWith(
      2,
      undefined,
      undefined,
      true,
    );
  });

  it.each([
    ['month zero', 'month=0'],
    ['month above twelve', 'month=13'],
    ['fractional month', 'month=1.5'],
    ['malformed month', 'month=abc'],
    ['year zero', 'year=0'],
    ['year above the supported calendar range', 'year=10000'],
    ['fractional year', 'year=2026.5'],
    ['malformed year', 'year=abc'],
  ])(
    'rejects %s on each list route before calling its service',
    async (_case, query) => {
      for (const route of routes) {
        await request(app.getHttpServer())
          .get(`${route.path}?${query}`)
          .expect(400);
      }

      expect(service.findAll).not.toHaveBeenCalled();
      expect(service.findAllPublic).not.toHaveBeenCalled();
      expect(service.findAllAdmin).not.toHaveBeenCalled();
    },
  );

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid approved literal %s',
    async (value) => {
      await request(app.getHttpServer())
        .get(`/api/national-releases/all?approved=${value}`)
        .expect(400);

      expect(service.findAllAdmin).not.toHaveBeenCalled();
    },
  );

  it('rejects repeated filter values instead of treating them as valid scalars', async () => {
    await request(app.getHttpServer())
      .get('/api/national-releases/all?month=1&month=2')
      .expect(400);

    expect(service.findAllAdmin).not.toHaveBeenCalled();
  });
});
