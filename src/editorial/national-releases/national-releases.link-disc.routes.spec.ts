import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { NationalReleasesController } from './national-releases.controller';
import { NationalReleasesService } from './national-releases.service';

describe('NationalReleasesController link Disc error contract', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const service = { linkDisc: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    service.linkDisc.mockRejectedValue(new Error('release write failed'));
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

  it('keeps the protected PATCH route and standard 500 response for persistence errors', async () => {
    const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
    const dto = { name: 'New album' };

    await request(app.getHttpServer())
      .patch(`/api/national-releases/${id}/link-disc`)
      .send(dto)
      .expect(500, {
        statusCode: 500,
        message: 'Internal server error',
      });

    expect(service.linkDisc).toHaveBeenCalledWith(id, dto);
  });

  it.each([
    [
      'an existing Catalog Disc',
      { discId: '8df8fec1-94a5-449b-a1f3-746226f0ed67' },
    ],
    ['new Disc details', { name: 'New album' }],
  ])('accepts %s and preserves the success response', async (_option, dto) => {
    const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
    const response = { id, discId: '8df8fec1-94a5-449b-a1f3-746226f0ed67' };
    service.linkDisc.mockResolvedValue(response);

    await request(app.getHttpServer())
      .patch(`/api/national-releases/${id}/link-disc`)
      .send(dto)
      .expect(200, response);

    expect(service.linkDisc).toHaveBeenCalledWith(id, dto);
  });

  it.each([
    ['no option', {}],
    [
      'both options',
      {
        discId: '8df8fec1-94a5-449b-a1f3-746226f0ed67',
        name: 'New album',
      },
    ],
    ['new Disc data without a name', { ep: true }],
    ['an invalid existing Disc ID', { discId: 'not-a-uuid' }],
  ])('rejects %s before calling the service', async (_case, dto) => {
    const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';

    await request(app.getHttpServer())
      .patch(`/api/national-releases/${id}/link-disc`)
      .send(dto)
      .expect(400);

    expect(service.linkDisc).not.toHaveBeenCalled();
  });
});
