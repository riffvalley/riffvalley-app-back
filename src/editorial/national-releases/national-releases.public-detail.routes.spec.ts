import { NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { NationalReleasesController } from './national-releases.controller';
import { NationalReleasesService } from './national-releases.service';

describe('NationalReleasesController public detail contract', () => {
  let app;
  let moduleRef: TestingModule;
  const service = {
    findOnePublic: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
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
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('preserves the public route and approved entity payload', async () => {
    const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
    const release = {
      id,
      artistName: 'Artist',
      discName: 'Album',
      discType: 'album',
      genre: 'Rock',
      releaseDay: '2026-10-20T00:00:00.000Z',
      publishAt: null,
      link: null,
      approved: true,
      discId: null,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    };
    service.findOnePublic.mockResolvedValue(release);

    await request(app.getHttpServer())
      .get(`/api/national-releases/${id}`)
      .expect(200, release);

    expect(service.findOnePublic).toHaveBeenCalledWith(id);
  });

  it('returns 404 for pending releases on the public route', async () => {
    const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
    service.findOnePublic.mockRejectedValue(
      new NotFoundException(`NationalRelease ${id} not found`),
    );

    await request(app.getHttpServer())
      .get(`/api/national-releases/${id}`)
      .expect(404);

    expect(service.findOnePublic).toHaveBeenCalledWith(id);
  });
});
