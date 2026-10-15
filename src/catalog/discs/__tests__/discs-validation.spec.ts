import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { UpdateDiscDto } from '../dto/update-discs.dto';
import { DiscsController } from '../discs.controller';

describe('DiscsController write validation', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const service = {
    create: jest.fn(),
    createWithArtist: jest.fn(),
    update: jest.fn(),
  };
  const controller = new DiscsController(service as any);

  beforeEach(() => jest.clearAllMocks());

  async function body<T>(payload: object, metatype: new (...args: any[]) => T) {
    return (await validationPipe.transform(payload, {
      type: 'body',
      metatype,
    })) as T;
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
