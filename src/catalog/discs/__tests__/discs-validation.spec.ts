import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRoleGuard } from '../../../identity/auth/guards/user-role/user-role.guard';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { UpdateDiscDto } from '../dto/update-discs.dto';
import { DiscsController } from '../discs.controller';
import { DiscsService } from '../discs.service';

describe('DiscsController write validation', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  let service: {
    create: jest.Mock<Promise<unknown>, Parameters<DiscsService['create']>>;
    createWithArtist: jest.Mock<
      Promise<unknown>,
      Parameters<DiscsService['createWithArtist']>
    >;
    update: jest.Mock<Promise<unknown>, Parameters<DiscsService['update']>>;
  };
  let controller: DiscsController;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = {
      create: jest.fn(),
      createWithArtist: jest.fn(),
      update: jest.fn(),
    };
    moduleRef = await Test.createTestingModule({
      controllers: [DiscsController],
      providers: [{ provide: DiscsService, useValue: service }],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();
    controller = moduleRef.get(DiscsController);
  });

  afterEach(async () => moduleRef.close());

  async function body<T extends object>(
    payload: object,
    metatype: new (...args: never[]) => T,
  ): Promise<T> {
    const transformed: unknown = await validationPipe.transform(payload, {
      type: 'body',
      metatype,
    });
    if (!(transformed instanceof metatype)) {
      throw new Error('ValidationPipe did not return the expected DTO');
    }
    return transformed;
  }

  it('rejects an invalid create payload before invoking the write service', async () => {
    await expect(
      (async () =>
        controller.create(
          await body(
            { name: 'Album', releaseDate: '2026-02-31' },
            CreateDiscDto,
          ),
        ))(),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      (async () =>
        controller.create(
          await body({ name: 'Album', ep: 'false' }, CreateDiscDto),
        ))(),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid partial update before invoking the write service', async () => {
    await expect(
      (async () =>
        controller.update(
          'disc-id',
          await body({ featured: 1 }, UpdateDiscDto),
        ))(),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      (async () =>
        controller.update(
          'disc-id',
          await body({ releaseDate: '2025-02-29' }, UpdateDiscDto),
        ))(),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('rejects invalid fields on the alternate create endpoint before writing', async () => {
    await expect(
      (async () =>
        controller.createWithArtist(
          await body(
            {
              discName: 'Album',
              artistName: 'Artist',
              ep: 'false',
            },
            CreateDiscWithArtistDto,
          ),
        ))(),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createWithArtist).not.toHaveBeenCalled();
  });
});
