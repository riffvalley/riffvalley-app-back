import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Country } from '../../countries/entities/country.entity';
import { AdministrativeRegion } from '../entities/administrative-region.entity';
import { AdministrativeRegionsQueryDto } from '../dto/administrative-regions-query.dto';
import { AdministrativeRegionsService } from '../administrative-regions.service';

describe('AdministrativeRegionsService', () => {
  let service: AdministrativeRegionsService;
  let regions: Record<string, jest.Mock>;
  let countries: Record<string, jest.Mock>;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    regions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
    };
    countries = { existsBy: jest.fn(async () => true) };
    moduleRef = await Test.createTestingModule({
      providers: [
        AdministrativeRegionsService,
        {
          provide: getRepositoryToken(AdministrativeRegion),
          useValue: regions,
        },
        { provide: getRepositoryToken(Country), useValue: countries },
      ],
    }).compile();
    service = moduleRef.get(AdministrativeRegionsService);
  });

  afterEach(async () => moduleRef.close());

  it('creates a normalized region linked to an existing country', async () => {
    await expect(
      service.create({
        name: '  País   Vasco ',
        countryId: 'country-es',
        code: ' es-pv ',
      }),
    ).resolves.toMatchObject({
      name: 'País Vasco',
      nameNormalized: 'pais vasco',
      countryId: 'country-es',
      code: 'ES-PV',
    });
    expect(countries.existsBy).toHaveBeenCalledWith({ id: 'country-es' });
  });

  it('maps equivalent names and repeated country-scoped codes to conflicts', async () => {
    regions.save.mockRejectedValueOnce({ code: '23505' });
    await expect(
      service.create({ name: 'Pais Vasco', countryId: 'country-es' }),
    ).rejects.toBeInstanceOf(ConflictException);
    regions.save.mockRejectedValueOnce({ code: '23505' });
    await expect(
      service.create({
        name: 'Other region',
        countryId: 'country-es',
        code: '01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows equivalent region names in separate countries and rejects a missing country', async () => {
    await expect(
      service.create({ name: 'Central', countryId: 'country-a' }),
    ).resolves.toMatchObject({ countryId: 'country-a' });
    await expect(
      service.create({ name: 'Central', countryId: 'country-b' }),
    ).resolves.toMatchObject({ countryId: 'country-b' });
    countries.existsBy.mockResolvedValueOnce(false);
    await expect(
      service.create({ name: 'Central', countryId: 'missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists regions filtered by country with pagination', async () => {
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'r-1' }], 1]),
    };
    regions.createQueryBuilder.mockReturnValue(builder);
    await expect(
      service.findAll(
        Object.assign(new AdministrativeRegionsQueryDto(), {
          countryId: 'country-es',
          limit: 10,
          offset: 10,
        }),
      ),
    ).resolves.toMatchObject({
      totalItems: 1,
      currentPage: 2,
      data: [{ id: 'r-1' }],
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'region.countryId = :countryId',
      { countryId: 'country-es' },
    );
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(builder.skip).toHaveBeenCalledWith(10);
  });

  it('updates basic fields but keeps region country identity fixed', async () => {
    regions.findOneBy.mockResolvedValue({
      id: 'region-id',
      name: 'Old name',
      nameNormalized: 'old name',
      countryId: 'country-es',
      code: null,
    });
    await expect(
      service.update('region-id', { name: ' New name ', code: 'es-xx' }),
    ).resolves.toMatchObject({
      name: 'New name',
      nameNormalized: 'new name',
      code: 'ES-XX',
    });
    await expect(
      service.update('region-id', { countryId: 'country-other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    regions.findOneBy.mockResolvedValue(null);
    await expect(service.update('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
