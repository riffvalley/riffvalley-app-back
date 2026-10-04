import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { getMetadataArgsStorage, Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { CountriesService } from './countries.service';
import { Artist } from '../artists/entities/artist.entity';

describe('CountriesService current behavior', () => {
  let service: CountriesService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    findOneByOrFail: jest.Mock;
    preload: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findAndCount: jest.fn(),
      findOneByOrFail: jest.fn(),
      preload: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    service = new CountriesService(repository as unknown as Repository<Country>);
  });

  describe('create and DTO contract', () => {
    it('creates and saves only the CreateCountryDto payload, returning the saved Country with isoCode', async () => {
      const dto = { name: 'Spain' } as CreateCountryDto;
      const country = { id: 'country-id', name: 'Spain', isoCode: 'ES' } as Country;
      repository.create.mockReturnValue(country);
      repository.save.mockResolvedValue({ id: 'persisted-copy', name: 'Spain', isoCode: 'ES' });

      await expect(service.create(dto)).resolves.toBe(country);
      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(repository.save).toHaveBeenCalledWith(country);
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(country).toHaveProperty('isoCode', 'ES');
      expect(Object.keys(new CreateCountryDto())).toEqual([]);
      expect('isoCode' in (dto as object)).toBe(false);
    });

    it('validates name as a string of 1 to 50 characters and rejects isoCode as an unknown creation field', async () => {
      const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

      await expect(
        pipe.transform({ name: 'Spain' }, { type: 'body', metatype: CreateCountryDto }),
      ).resolves.toMatchObject({ name: 'Spain' });
      await expect(
        pipe.transform({ name: '' }, { type: 'body', metatype: CreateCountryDto }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pipe.transform({ name: 23 }, { type: 'body', metatype: CreateCountryDto }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pipe.transform({ name: 'x'.repeat(51) }, { type: 'body', metatype: CreateCountryDto }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pipe.transform({ name: 'Spain', isoCode: 'ES' }, { type: 'body', metatype: CreateCountryDto }),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ message: expect.arrayContaining([expect.stringContaining('isoCode')]) }),
      });
    });

    it('maps unique constraint errors to 400 and other persistence errors to the current 500', async () => {
      repository.create.mockReturnValue({ name: 'Spain' });
      repository.save.mockRejectedValueOnce({ code: '23505', detail: 'duplicate country name' });
      await expect(service.create({ name: 'Spain' } as CreateCountryDto)).rejects.toEqual(
        new BadRequestException('duplicate country name'),
      );

      repository.save.mockRejectedValueOnce(new Error('database offline'));
      await expect(service.create({ name: 'Spain' } as CreateCountryDto)).rejects.toMatchObject({
        status: 500,
        message: 'An unexpected error occurred',
      });
      expect(repository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAll', () => {
    it('uses limit 10 and offset 0 defaults, with no explicit order, and returns the exact envelope', async () => {
      const countries = [
        { id: 'country-a', name: 'Spain', isoCode: 'ES' },
        { id: 'country-b', name: 'France', isoCode: 'FR' },
      ] as Country[];
      repository.findAndCount.mockResolvedValue([countries, 12]);

      await expect(service.findAll({} as PaginationDto)).resolves.toEqual({
        totalItems: 12,
        totalPages: 2,
        currentPage: 1,
        limit: 10,
        data: countries,
      });
      expect(repository.findAndCount).toHaveBeenCalledWith({ take: 10, skip: 0 });
      expect(repository.findAndCount).toHaveBeenCalledTimes(1);
    });

    it('uses supplied limit and offset in findAndCount and calculates the current pagination values', async () => {
      const countries = [{ id: 'country-a', name: 'Spain', isoCode: null }] as Country[];
      repository.findAndCount.mockResolvedValue([countries, 11]);

      await expect(service.findAll({ limit: 5, offset: 10 } as PaginationDto)).resolves.toEqual({
        totalItems: 11,
        totalPages: 3,
        currentPage: 3,
        limit: 5,
        data: countries,
      });
      expect(repository.findAndCount).toHaveBeenCalledWith({ take: 5, skip: 10 });
    });

    it('keeps the existing zero-result, out-of-range and direct-service edge calculations', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);
      await expect(service.findAll({} as PaginationDto)).resolves.toEqual({
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 10,
        data: [],
      });

      repository.findAndCount.mockResolvedValue([[], 11]);
      await expect(service.findAll({ limit: 5, offset: 30 } as PaginationDto)).resolves.toEqual({
        totalItems: 11,
        totalPages: 3,
        currentPage: 7,
        limit: 5,
        data: [],
      });
      repository.findAndCount.mockResolvedValue([[], 4]);
      await expect(service.findAll({ limit: 0, offset: 0 } as PaginationDto)).resolves.toMatchObject({
        totalPages: Infinity,
        currentPage: NaN,
        limit: 0,
      });
    });
  });

  describe('findOne', () => {
    it('returns an existing Country entity unchanged', async () => {
      const country = { id: 'country-id', name: 'Spain', isoCode: 'ES' } as Country;
      repository.findOneByOrFail.mockResolvedValue(country);

      await expect(service.findOne(country.id)).resolves.toBe(country);
      expect(repository.findOneByOrFail).toHaveBeenCalledWith({ id: country.id });
    });

    it('converts an absent ID to the current 404 and message', async () => {
      repository.findOneByOrFail.mockRejectedValue(new Error('Entity not found'));

      await expect(service.findOne('missing-id')).rejects.toEqual(
        new NotFoundException('Country with id missing-id not found'),
      );
    });

    it('also converts a general repository failure to the same 404', async () => {
      repository.findOneByOrFail.mockRejectedValue(new Error('database offline'));

      await expect(service.findOne('country-id')).rejects.toEqual(
        new NotFoundException('Country with id country-id not found'),
      );
    });
  });

  describe('update', () => {
    it('preloads and saves a partial name update while retaining the entity isoCode', async () => {
      const country = { id: 'country-id', name: 'España', isoCode: 'ES' } as Country;
      const dto = { name: 'España' } as UpdateCountryDto;
      repository.preload.mockResolvedValue(country);
      repository.save.mockResolvedValue({ id: 'persisted-copy', name: 'España', isoCode: 'ES' });

      await expect(service.update(country.id, dto)).resolves.toBe(country);
      expect(repository.preload).toHaveBeenCalledWith({ id: country.id, name: 'España' });
      expect(repository.save).toHaveBeenCalledWith(country);
      expect(country.isoCode).toBe('ES');
      expect('isoCode' in (dto as object)).toBe(false);
    });

    it('allows an empty partial update and throws the current 404 if preload finds no Country', async () => {
      repository.preload.mockResolvedValueOnce({ id: 'country-id', name: 'Spain', isoCode: null });
      await expect(service.update('country-id', {})).resolves.toMatchObject({ id: 'country-id' });
      expect(repository.preload).toHaveBeenCalledWith({ id: 'country-id' });

      repository.preload.mockResolvedValueOnce(undefined);
      await expect(service.update('missing-id', { name: 'Spain' })).rejects.toEqual(
        new NotFoundException('Country with id missing-id not found'),
      );
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects isoCode as an unknown update field and maps save errors using the current handler', async () => {
      const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
      await expect(
        pipe.transform({ isoCode: 'FR' }, { type: 'body', metatype: UpdateCountryDto }),
      ).rejects.toMatchObject({ status: 400 });

      repository.preload.mockResolvedValue({ id: 'country-id', name: 'Spain', isoCode: 'ES' });
      repository.save.mockRejectedValue({ code: '23505', detail: 'duplicate country name' });
      await expect(service.update('country-id', { name: 'Spain' })).rejects.toEqual(
        new BadRequestException('duplicate country name'),
      );
      repository.save.mockRejectedValue(new Error('database offline'));
      await expect(service.update('country-id', { name: 'Spain' })).rejects.toMatchObject({
        status: 500,
        message: 'An unexpected error occurred',
      });
    });
  });

  describe('remove', () => {
    it('calls repository.delete directly and returns the DeleteResult unchanged when affected is zero', async () => {
      const deleteResult = { raw: [], affected: 0 };
      repository.delete.mockResolvedValue(deleteResult);

      await expect(service.remove('missing-id')).resolves.toBe(deleteResult);
      expect(repository.delete).toHaveBeenCalledWith({ id: 'missing-id' });
      expect(repository.delete).toHaveBeenCalledTimes(1);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('does not translate repository errors, so a possible foreign-key failure propagates unchanged', async () => {
      const foreignKeyError = { code: '23503', detail: 'country is referenced by an artist' };
      repository.delete.mockRejectedValue(foreignKeyError);

      await expect(service.remove('referenced-id')).rejects.toBe(foreignKeyError);
    });
  });

  describe('Country and Artist relation metadata', () => {
    it('records Country.artist as the inverse collection and Artist.country as eager nullable many-to-one', () => {
      const relations = getMetadataArgsStorage().relations;
      const countryArtist = relations.find((relation) => relation.target === Country && relation.propertyName === 'artist');
      const artistCountry = relations.find((relation) => relation.target === Artist && relation.propertyName === 'country');

      expect(countryArtist).toMatchObject({ relationType: 'one-to-many', options: { cascade: true } });
      expect(artistCountry).toMatchObject({
        relationType: 'many-to-one',
        options: { eager: true, nullable: true },
      });
      expect(countryArtist?.inverseSideProperty).toEqual(expect.any(Function));
      expect(artistCountry?.inverseSideProperty).toEqual(expect.any(Function));
      expect((countryArtist?.inverseSideProperty as (value: object) => unknown)({ country: 'country' })).toBe(
        'country',
      );
      expect((artistCountry?.inverseSideProperty as (value: object) => unknown)({ artist: 'artist' })).toBe(
        'artist',
      );
    });
  });
});
