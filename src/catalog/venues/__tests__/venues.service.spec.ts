import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Locality } from '../entities/locality.entity';
import { Venue } from '../entities/venue.entity';
import { CreateVenueDto } from '../dto/create-venue.dto';
import { VenuesQueryDto } from '../dto/venues-query.dto';
import { UpdateVenueDto } from '../dto/update-venue.dto';
import { ImportVenuesBatchDto } from '../dto/import-venues-batch.dto';
import { VenuesService } from '../venues.service';

describe('VenuesService', () => {
  let service: VenuesService;
  let venues: Record<string, jest.Mock>;
  let localities: Record<string, jest.Mock>;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    venues = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      query: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    localities = {
      existsBy: jest.fn(async () => true),
      findOneBy: jest.fn(),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        VenuesService,
        { provide: getRepositoryToken(Venue), useValue: venues },
        { provide: getRepositoryToken(Locality), useValue: localities },
      ],
    }).compile();
    service = moduleRef.get(VenuesService);
  });

  afterEach(async () => moduleRef.close());

  it('validates required and optional venue fields, enums, capacity, URLs and coordinate ranges', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const base = {
      name: 'Sala Sol',
      type: 'concert_hall',
      localityId: 'ef29c360-a723-41af-8c12-c70f6908b4c6',
    };
    await expect(
      pipe.transform(base, { type: 'body', metatype: CreateVenueDto }),
    ).resolves.toMatchObject({ name: 'Sala Sol', type: 'concert_hall' });
    for (const invalid of [
      { ...base, name: '   ' },
      { ...base, type: 'warehouse' },
      { ...base, status: 'unknown' },
      { ...base, capacity: 0 },
      { ...base, capacity: 3.5 },
      { ...base, website: 'not a URL' },
      { ...base, latitude: 91, longitude: 0 },
      { ...base, latitude: 0 },
      { ...base, isGeneric: true },
    ]) {
      await expect(
        pipe.transform(invalid, { type: 'body', metatype: CreateVenueDto }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('creates a venue with normalized name, defaults status and keeps optional fields nullable', async () => {
    const dto = {
      name: '  Sala   Sol ',
      type: 'concert_hall',
      localityId: 'locality-id',
    } as CreateVenueDto;
    await expect(service.create(dto)).resolves.toMatchObject({
      name: 'Sala Sol',
      nameNormalized: 'sala sol',
      status: 'active',
      latitude: null,
      longitude: null,
    });
    expect(venues.save).toHaveBeenCalledTimes(1);
    expect(localities.existsBy).toHaveBeenCalledWith({ id: 'locality-id' });
  });

  it('creates and reuses a locality generic venue with no physical coordinates', async () => {
    localities.findOneBy.mockResolvedValue({
      id: 'locality-id',
      name: 'Santander',
    });
    venues.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'generic-id', isGeneric: true });
    venues.query.mockResolvedValue([{ id: 'generic-id' }]);

    await expect(
      service.getOrCreateGenericVenue('locality-id'),
    ).resolves.toEqual({
      id: 'generic-id',
      isGeneric: true,
    });
    expect(venues.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ON CONFLICT ("locality_id") WHERE "is_generic" = true DO NOTHING',
      ),
      ['Santander', 'santander', 'locality-id'],
    );
    expect(venues.findOneBy).toHaveBeenNthCalledWith(2, { id: 'generic-id' });
  });

  it('reports whether a transaction created or reused the generic venue', async () => {
    localities.findOneBy.mockResolvedValue({
      id: 'locality-id',
      name: 'Santander',
    });
    venues.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'generic-id', isGeneric: true });
    venues.query.mockResolvedValue([{ id: 'generic-id' }]);

    await expect(
      service.getOrCreateGenericVenueWithStatus('locality-id'),
    ).resolves.toEqual({
      venue: { id: 'generic-id', isGeneric: true },
      status: 'created',
    });
  });

  it('creates import venues transactionally and reuses normalized conflicts', async () => {
    const manager = Object.create(EntityManager.prototype) as EntityManager;
    Object.assign(manager, {
      getRepository: jest.fn().mockReturnValue(venues),
    });
    venues.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced-id', name: 'Sala Sol' });
    venues.query.mockResolvedValueOnce([]);

    await expect(
      service.createImportVenue(' Sala   Sol ', 'locality-id', manager),
    ).resolves.toEqual({
      venue: { id: 'raced-id', name: 'Sala Sol' },
      status: 'existing',
    });
    expect(venues.findOneBy).toHaveBeenNthCalledWith(2, {
      localityId: 'locality-id',
      nameNormalized: 'sala sol',
      isGeneric: false,
    });
    expect(venues.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("locality_id", "name_normalized")'),
      ['Sala Sol', 'sala sol', 'locality-id'],
    );
  });

  it('returns the existing generic venue and rejects a missing locality', async () => {
    localities.findOneBy.mockResolvedValueOnce({
      id: 'locality-id',
      name: 'Bilbao',
    });
    venues.findOneBy.mockResolvedValueOnce({
      id: 'generic-id',
      isGeneric: true,
    });
    await expect(
      service.getOrCreateGenericVenue('locality-id'),
    ).resolves.toMatchObject({
      id: 'generic-id',
    });
    expect(venues.query).not.toHaveBeenCalled();

    localities.findOneBy.mockResolvedValueOnce(null);
    await expect(
      service.getOrCreateGenericVenue('missing'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recovers the winning generic venue after a concurrent insert', async () => {
    localities.findOneBy.mockResolvedValue({
      id: 'locality-id',
      name: 'Gijón',
    });
    venues.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'concurrent-id', isGeneric: true });
    venues.query.mockResolvedValue([]);
    await expect(
      service.getOrCreateGenericVenue('locality-id'),
    ).resolves.toMatchObject({
      id: 'concurrent-id',
      isGeneric: true,
    });
    expect(venues.findOneBy).toHaveBeenNthCalledWith(2, {
      localityId: 'locality-id',
      isGeneric: true,
    });
  });

  it('imports a locality batch, defaults types, preserves order and reports in-batch duplicates', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    let savedId = 0;
    venues.save.mockImplementation(async (value) => ({
      ...value,
      id: `venue-${++savedId}`,
    }));

    const result = await service.importBatch({
      localityId: 'locality-id',
      venues: [
        { name: ' Sala   Sol ' },
        { name: 'Wurlitzer Ballroom', type: 'concert_hall' },
        { name: 'SALA SOL', type: 'arena' },
      ],
    } as ImportVenuesBatchDto);

    expect(result.summary).toEqual({
      total: 3,
      created: 2,
      existing: 0,
      duplicates: 1,
      failed: 0,
    });
    expect(result.results).toEqual([
      expect.objectContaining({
        index: 0,
        status: 'created',
        venueId: 'venue-1',
      }),
      expect.objectContaining({
        index: 1,
        status: 'created',
        venueId: 'venue-2',
      }),
      expect.objectContaining({
        index: 2,
        status: 'duplicate_in_batch',
        venueId: 'venue-1',
      }),
    ]);
    expect(venues.save).toHaveBeenCalledTimes(2);
    expect(localities.existsBy).toHaveBeenCalledTimes(1);
    expect(venues.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(venues.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'concert_hall', name: 'Sala Sol' }),
    );
  });

  it('validates batch shape, locality UUID, row count and top-level unknown properties', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const base = {
      localityId: 'ef29c360-a723-41af-8c12-c70f6908b4c6',
      venues: [{ name: 'Sala Sol' }],
    };
    const transformed = await pipe.transform(base, {
      type: 'body',
      metatype: ImportVenuesBatchDto,
    });
    expect(transformed).toBeInstanceOf(ImportVenuesBatchDto);
    expect(transformed.venues[0]).toEqual({ name: 'Sala Sol' });
    expect(Array.isArray(transformed.venues[0])).toBe(false);
    for (const invalid of [
      { ...base, localityId: 'not-a-uuid' },
      { ...base, venues: [] },
      { ...base, venues: 'not-an-array' },
      { ...base, unexpected: true },
      {
        ...base,
        venues: Array.from({ length: 101 }, () => ({ name: 'Hall' })),
      },
    ]) {
      await expect(
        pipe.transform(invalid, {
          type: 'body',
          metatype: ImportVenuesBatchDto,
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('reuses existing records within the locality without changing their data', async () => {
    const existing = {
      id: 'existing-id',
      localityId: 'locality-id',
      name: 'Sala Sol',
      nameNormalized: 'sala sol',
      type: 'arena',
      capacity: 12000,
    };
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([existing]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    const result = await service.importBatch({
      localityId: 'locality-id',
      venues: [{ name: '  SALA   SOL ', type: 'concert_hall' }],
    } as ImportVenuesBatchDto);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'existing', venueId: 'existing-id' }),
    ]);
    expect(venues.save).not.toHaveBeenCalled();
    expect(existing).toMatchObject({ type: 'arena', capacity: 12000 });
    expect(builder.where).toHaveBeenCalledWith('venue.isGeneric = false');
    expect(builder.andWhere).toHaveBeenCalledWith(
      'venue.localityId = :localityId',
      { localityId: 'locality-id' },
    );
  });

  it('makes an identical repeat import idempotent', async () => {
    const persisted = {
      id: 'repeat-id',
      localityId: 'locality-id',
      name: 'Sala Sol',
      nameNormalized: 'sala sol',
      type: 'concert_hall',
    };
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([persisted]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    venues.save.mockResolvedValue(persisted);
    const input = {
      localityId: 'locality-id',
      venues: [{ name: 'Sala Sol' }],
    } as ImportVenuesBatchDto;
    const first = await service.importBatch(input);
    const second = await service.importBatch(input);
    expect(first.results[0]).toMatchObject({
      status: 'created',
      venueId: 'repeat-id',
    });
    expect(second.results[0]).toMatchObject({
      status: 'existing',
      venueId: 'repeat-id',
    });
    expect(venues.save).toHaveBeenCalledTimes(1);
  });

  it('reports invalid rows independently and imports valid rows', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    venues.save.mockImplementation(async (value) => ({
      ...value,
      id: 'good-id',
    }));
    const result = await service.importBatch({
      localityId: 'locality-id',
      venues: [
        { name: '  ' },
        { name: 'Good venue' },
        { name: 'Unknown property', address: 'unexpected' },
        { name: 'Invalid type', type: 'warehouse' },
        { name: 'Null type', type: null },
      ],
    } as ImportVenuesBatchDto);
    expect(result.summary).toEqual({
      total: 5,
      created: 1,
      existing: 0,
      duplicates: 0,
      failed: 4,
    });
    expect(result.results.map((item) => item.index)).toEqual([0, 1, 2, 3, 4]);
    expect(venues.save).toHaveBeenCalledTimes(1);
  });

  it('handles a unique-index race by reusing the concurrently created venue', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    venues.save.mockRejectedValueOnce({ code: '23505' });
    venues.findOneBy.mockResolvedValue({ id: 'raced-id' });
    const result = await service.importBatch({
      localityId: 'locality-id',
      venues: [{ name: 'Race Hall' }],
    } as ImportVenuesBatchDto);
    expect(result.summary).toMatchObject({ existing: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({
      status: 'existing',
      venueId: 'raced-id',
    });
    expect(venues.findOneBy).toHaveBeenCalledWith({
      localityId: 'locality-id',
      nameNormalized: 'race hall',
    });
  });

  it('continues processing after an individual database error', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    venues.save
      .mockRejectedValueOnce(new Error('database failure'))
      .mockImplementationOnce(async (value) => ({ ...value, id: 'saved-id' }));
    const result = await service.importBatch({
      localityId: 'locality-id',
      venues: [{ name: 'Broken' }, { name: 'Saved' }],
    } as ImportVenuesBatchDto);
    expect(result.summary).toEqual({
      total: 2,
      created: 1,
      existing: 0,
      duplicates: 0,
      failed: 1,
    });
    expect(result.results).toEqual([
      expect.objectContaining({ index: 0, status: 'failed' }),
      expect.objectContaining({
        index: 1,
        status: 'created',
        venueId: 'saved-id',
      }),
    ]);
  });

  it('rejects a nonexistent locality before any venue writes', async () => {
    localities.existsBy.mockResolvedValue(false);
    await expect(
      service.importBatch({
        localityId: 'missing',
        venues: [{ name: 'Hall' }],
      } as ImportVenuesBatchDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(venues.save).not.toHaveBeenCalled();
  });

  it('rejects missing localities, coordinate pairs and same-name duplicates in one locality', async () => {
    localities.existsBy.mockResolvedValueOnce(false);
    await expect(
      service.create({
        name: 'Sala',
        type: 'other',
        localityId: 'missing',
      } as CreateVenueDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Sala',
        type: 'other',
        localityId: 'locality-id',
        latitude: 1,
      } as CreateVenueDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    venues.save.mockRejectedValueOnce({ code: '23505' });
    await expect(
      service.create({
        name: 'Sala',
        type: 'other',
        localityId: 'locality-id',
      } as CreateVenueDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates existing records and rejects coordinates that would become an incomplete pair', async () => {
    venues.findOneBy.mockResolvedValue({
      id: 'venue-id',
      name: 'Old name',
      nameNormalized: 'old name',
      latitude: 1,
      longitude: 2,
    });
    await expect(
      service.update('venue-id', { name: ' New name ' } as UpdateVenueDto),
    ).resolves.toMatchObject({ name: 'New name', nameNormalized: 'new name' });
    venues.findOneBy.mockResolvedValue({
      id: 'venue-id',
      latitude: 1,
      longitude: 2,
    });
    await expect(
      service.update('venue-id', { latitude: null } as UpdateVenueDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    venues.findOneBy.mockResolvedValue(null);
    await expect(
      service.update('missing', {} as UpdateVenueDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a map-only projection with venue coordinates taking precedence and locality fallback', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'one',
          name: 'A',
          type: 'arena',
          locality: 'Madrid',
          province: 'Madrid',
          region: 'Comunidad de Madrid',
          country: 'Spain',
          latitude: '40.1',
          longitude: '-3.7',
          precision: 'venue',
        },
        {
          id: 'two',
          name: 'B',
          type: 'other',
          locality: 'Madrid',
          province: 'Madrid',
          region: 'Comunidad de Madrid',
          country: 'Spain',
          latitude: '40.2',
          longitude: '-3.8',
          precision: 'locality',
        },
      ]),
      getCount: jest.fn().mockResolvedValue(2),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 2]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    const result = await service.findMap(new VenuesQueryDto());
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'one',
        latitude: 40.1,
        precision: 'venue',
      }),
      expect.objectContaining({
        id: 'two',
        longitude: -3.8,
        region: 'Comunidad de Madrid',
        precision: 'locality',
      }),
    ]);
    expect(result.data[0]).not.toHaveProperty('description');
    expect(result.attribution).toEqual({
      text: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
    });
    expect(venues.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('loads venue detail with locality and country and reports missing records', async () => {
    const venue = {
      id: 'venue-id',
      locality: {
        name: 'Madrid',
        province: 'Madrid',
        administrativeRegion: {
          name: 'Comunidad de Madrid',
          country: { name: 'Spain' },
        },
      },
    };
    venues.findOne.mockResolvedValueOnce(venue).mockResolvedValueOnce(null);
    await expect(service.findOne('venue-id')).resolves.toBe(venue);
    expect(venues.findOne).toHaveBeenCalledWith({
      where: { id: 'venue-id' },
      relations: {
        locality: { administrativeRegion: { country: true } },
      },
    });
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes an existing venue without cascading to its locality', async () => {
    venues.delete
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    await expect(service.remove('venue-id')).resolves.toEqual({ affected: 1 });
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(venues.delete).toHaveBeenCalledWith({ id: 'venue-id' });
  });

  it('resolves exact name matches only within the supplied locality', async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'venue-id',
          name: 'Sala Sol',
          nameNormalized: 'sala sol',
          localityId: 'madrid',
        },
      ]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    await expect(
      service.resolveBatch({
        venues: [
          { name: ' SALA   SOL ', localityId: 'madrid' },
          { name: 'Sala Sol', localityId: 'barcelona' },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          name: ' SALA   SOL ',
          localityId: 'madrid',
          venue: { id: 'venue-id', name: 'Sala Sol' },
        },
        { name: 'Sala Sol', localityId: 'barcelona', venue: null },
      ],
    });
  });

  it('applies listing filters and pagination without external services', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    venues.createQueryBuilder.mockReturnValue(builder);
    await service.findAll(
      Object.assign(new VenuesQueryDto(), {
        limit: 10,
        offset: 20,
        query: 'Sala',
        localityId: 'loc',
        province: 'Madrid',
        administrativeRegionId: 'region-id',
        countryId: 'country',
        type: 'arena',
        status: 'active',
      }),
    );
    expect(builder.andWhere).toHaveBeenCalledTimes(7);
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(builder.skip).toHaveBeenCalledWith(20);
  });
});
