import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { NationalReleasesController } from './national-releases.controller';
import { NationalReleasesService } from './national-releases.service';

describe('NationalReleasesController create body validation', () => {
  let app;
  let moduleRef: TestingModule;
  const service = {
    create: jest.fn(),
    createMany: jest.fn(),
  };

  const validRelease = (discName = 'Album') => ({
    artistName: 'Artist',
    discName,
    discType: 'album',
    genre: 'Rock',
    releaseDay: '2026-10-20',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    service.create.mockImplementation(async (dto) => ({
      id: 'release-1',
      ...dto,
    }));
    service.createMany.mockImplementation(async (dtos) =>
      dtos.map((dto, index) => ({ id: `release-${index + 1}`, ...dto })),
    );

    moduleRef = await Test.createTestingModule({
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('preserves singular creation route and response', async () => {
    const dto = validRelease();
    const response = { id: 'release-1', ...dto };

    await request(app.getHttpServer())
      .post('/api/national-releases')
      .send(dto)
      .expect(201, response);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid enum', { ...validRelease(), discType: 'compilation' }],
    ['invalid date', { ...validRelease(), releaseDay: 'not-a-date' }],
    ['invalid URL', { ...validRelease(), link: 'not-a-url' }],
    ['unknown property', { ...validRelease(), unexpected: true }],
  ])(
    'rejects singular creation with %s before calling the service',
    async (_case, dto) => {
      await request(app.getHttpServer())
        .post('/api/national-releases')
        .send(dto)
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
      expect(service.createMany).not.toHaveBeenCalled();
    },
  );

  it('preserves array creation on the root route', async () => {
    const dtos = [validRelease('Album'), validRelease('EP')];
    const response = dtos.map((dto, index) => ({
      id: `release-${index + 1}`,
      ...dto,
    }));

    await request(app.getHttpServer())
      .post('/api/national-releases')
      .send(dtos)
      .expect(201, response);

    expect(service.createMany).toHaveBeenCalledWith(dtos);
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid nested enum', { ...validRelease(), discType: 'compilation' }],
    ['unknown nested property', { ...validRelease(), unexpected: true }],
    ['null item', null],
  ])(
    'rejects an array item with %s before calling the service',
    async (_case, invalidDto) => {
      await request(app.getHttpServer())
        .post('/api/national-releases')
        .send([validRelease(), invalidDto])
        .expect(400);

      expect(service.createMany).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
    },
  );

  it('validates and preserves the protected bulk route', async () => {
    const dtos = [validRelease()];
    const response = [{ id: 'release-1', ...dtos[0] }];

    await request(app.getHttpServer())
      .post('/api/national-releases/bulk')
      .send(dtos)
      .expect(201, response);

    expect(service.createMany).toHaveBeenCalledWith(dtos);

    jest.clearAllMocks();
    await request(app.getHttpServer())
      .post('/api/national-releases/bulk')
      .send([{ ...validRelease(), link: 'invalid-url' }])
      .expect(400);

    expect(service.createMany).not.toHaveBeenCalled();
  });
});
