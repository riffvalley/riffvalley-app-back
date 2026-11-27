import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdministrativeRegionsService } from '../../../administrative-regions/administrative-regions.service';
import { AdministrativeRegion } from '../../../administrative-regions/entities/administrative-region.entity';
import { Country } from '../../../countries/entities/country.entity';
import { normalizeGeography } from '../../../geography/helpers/normalize-geography';
import { Locality } from '../../entities/locality.entity';
import { LocalityAlias } from '../../entities/locality-alias.entity';
import { ResolveLocalityDto } from '../../dto/resolve-locality.dto';
import { LocalitiesService } from '../localities.service';
import { NominatimGeocoderService } from '../nominatim-geocoder.service';

describe('LocalitiesService', () => {
  let service: LocalitiesService;
  let localities: Record<string, jest.Mock>;
  let aliases: Record<string, jest.Mock>;
  let countries: Record<string, jest.Mock>;
  let administrativeRegions: Record<string, jest.Mock>;
  let regions: { findOne: jest.Mock; findByIdentity: jest.Mock };
  let geocoder: { geocode: jest.Mock };
  let moduleRef: TestingModule;
  const country = { id: 'country-id', name: 'Spain', isoCode: 'ES' };
  const region = {
    id: 'region-id',
    name: 'País Vasco',
    countryId: 'country-id',
    country,
  };

  beforeEach(async () => {
    localities = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      delete: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(),
    };
    aliases = {
      find: jest.fn(async () => []),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      remove: jest.fn(async () => undefined),
    };
    countries = { find: jest.fn(async () => [country]) };
    administrativeRegions = {
      find: jest.fn(async () => [region]),
    };
    regions = {
      findOne: jest.fn(async () => region),
      findByIdentity: jest.fn(async () => region),
    };
    geocoder = { geocode: jest.fn() };
    moduleRef = await Test.createTestingModule({
      providers: [
        LocalitiesService,
        { provide: getRepositoryToken(Locality), useValue: localities },
        { provide: getRepositoryToken(LocalityAlias), useValue: aliases },
        { provide: getRepositoryToken(Country), useValue: countries },
        {
          provide: getRepositoryToken(AdministrativeRegion),
          useValue: administrativeRegions,
        },
        { provide: AdministrativeRegionsService, useValue: regions },
        { provide: NominatimGeocoderService, useValue: geocoder },
      ],
    }).compile();
    service = moduleRef.get(LocalitiesService);
  });

  afterEach(async () => moduleRef?.close());

  const input = {
    name: '  San Sebastián ',
    administrativeRegionId: 'region-id',
    province: 'Gipuzkoa',
  } as ResolveLocalityDto;

  it('inspects localities in one read-only batch and resolves aliases with geography context', async () => {
    const locality = {
      id: 'locality-id',
      name: 'Donostia',
      nameNormalized: 'donostia',
      province: 'Gipuzkoa',
      provinceNormalized: 'gipuzkoa',
      administrativeRegionId: region.id,
      administrativeRegion: region,
      aliases: [{ normalizedName: 'san sebastian' }],
    } as Locality;
    const queryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([locality]),
    };
    localities.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.inspectBatch({
        localities: [
          {
            name: 'San Sebastián',
            countryId: 'country-id',
            province: 'Gipuzkoa',
          },
        ],
      }),
    ).resolves.toMatchObject({
      results: [
        {
          index: 0,
          status: 'existing',
          locality: {
            id: 'locality-id',
            name: 'Donostia',
            country: { id: 'country-id', name: 'Spain' },
            administrativeRegion: { id: 'region-id', name: 'País Vasco' },
          },
        },
      ],
    });
    expect(localities.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(localities.save).not.toHaveBeenCalled();
    expect(aliases.save).not.toHaveBeenCalled();
  });

  it('returns all homonymous localities and rejects invalid context without guessing', async () => {
    const first = {
      id: 'locality-one',
      name: 'Santiago',
      province: 'A Coruña',
      provinceNormalized: 'a coruna',
      nameNormalized: 'santiago',
      administrativeRegionId: 'region-id',
      administrativeRegion: region,
      aliases: [],
    } as Locality;
    const second = {
      ...first,
      id: 'locality-two',
      province: 'Pontevedra',
      provinceNormalized: 'pontevedra',
      administrativeRegionId: 'region-two',
      administrativeRegion: {
        ...region,
        id: 'region-two',
        name: 'Galicia 2',
      },
    } as Locality;
    const queryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([first, second]),
    };
    localities.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.inspectBatch({
      localities: [
        { name: 'Santiago', countryId: 'country-id' },
        {
          name: 'Santiago',
          countryId: 'country-id',
          administrativeRegionId: 'region-id',
        },
      ],
    });
    expect(result.results[0]).toMatchObject({
      index: 0,
      status: 'ambiguous',
      code: 'LOCALITY_AMBIGUOUS',
      candidates: [{ id: 'locality-one' }, { id: 'locality-two' }],
    });
    expect(result.results[1]).toMatchObject({
      index: 1,
      status: 'existing',
      locality: { id: 'locality-one' },
    });

    countries.find.mockResolvedValueOnce([]);
    await expect(
      service.inspectBatch({
        localities: [{ name: 'Santiago', countryId: 'missing-country' }],
      }),
    ).resolves.toMatchObject({
      results: [
        {
          status: 'invalid',
          code: 'LOCALITY_COUNTRY_NOT_FOUND',
        },
      ],
    });
    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(localities.save).not.toHaveBeenCalled();
  });

  it('reuses stored coordinates and avoids calling Nominatim', async () => {
    const locality = {
      id: 'locality-id',
      latitude: 43.3,
      longitude: -1.9,
      provinceNormalized: 'gipuzkoa',
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([locality]);
    await expect(service.resolveAndGeocode(input)).resolves.toMatchObject({
      locality: { id: 'locality-id', latitude: 43.3 },
      geocoding: { status: 'cached' },
    });
    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(localities.save).not.toHaveBeenCalled();
  });

  it('keeps a new locality when provider lookup fails and allows a later retry', async () => {
    localities.find.mockResolvedValue([]);
    localities.save.mockImplementation(async (value) => ({
      id: 'new-id',
      ...value,
    }));
    geocoder.geocode.mockResolvedValue({ status: 'unavailable' });
    await expect(service.resolveAndGeocode(input)).resolves.toMatchObject({
      locality: { id: 'new-id' },
      geocoding: { status: 'unavailable' },
    });
    expect(localities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'San Sebastián',
        nameNormalized: 'san sebastian',
        provinceNormalized: 'gipuzkoa',
        administrativeRegionId: 'region-id',
      }),
    );
  });

  it('persists coordinates and OSM identity only for a reliable result', async () => {
    const locality = {
      id: 'locality-id',
      latitude: null,
      longitude: null,
      provinceNormalized: 'gipuzkoa',
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([locality]);
    geocoder.geocode.mockResolvedValue({
      status: 'geocoded',
      latitude: 43.3,
      longitude: -1.9,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    await expect(service.resolveAndGeocode(input)).resolves.toMatchObject({
      locality: {
        latitude: 43.3,
        longitude: -1.9,
        osmType: 'relation',
        osmId: '123',
      },
      geocoding: { status: 'geocoded' },
    });
    expect(localities.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Gerona', 'Girona'],
    ['Lérida', 'Lleida'],
    ['San Sebastián', 'Donostia'],
  ])(
    'reuses %s as an alias of canonical locality %s',
    async (name, canonicalName) => {
      const canonicalNormalized = canonicalName.toLowerCase();
      const canonical = {
        id: `locality-${canonicalNormalized}`,
        name: canonicalName,
        nameNormalized: canonicalNormalized,
        administrativeRegionId: region.id,
        provinceNormalized: 'gipuzkoa',
        latitude: 43.3,
        longitude: -1.9,
        administrativeRegion: region,
        aliases: [],
      } as Locality;
      localities.find.mockResolvedValue([]);
      aliases.find.mockResolvedValue([{ locality: canonical }]);
      await expect(
        service.resolveAndGeocode({ ...input, name }),
      ).resolves.toMatchObject({
        locality: { id: canonical.id, name: canonicalName },
      });
      expect(geocoder.geocode).not.toHaveBeenCalled();
      expect(localities.create).not.toHaveBeenCalled();
      expect(aliases.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { normalizedName: normalizeGeography(name) },
        }),
      );
    },
  );

  it('returns ambiguous when multiple alias localities fit the supplied context', async () => {
    localities.find.mockResolvedValue([]);
    aliases.find.mockResolvedValue([
      {
        locality: {
          id: 'one',
          administrativeRegionId: region.id,
          provinceNormalized: 'gipuzkoa',
        },
      },
      {
        locality: {
          id: 'two',
          administrativeRegionId: region.id,
          provinceNormalized: 'gipuzkoa',
        },
      },
    ]);
    await expect(service.resolveAndGeocode(input)).resolves.toMatchObject({
      locality: null,
      geocoding: { status: 'ambiguous' },
    });
    expect(geocoder.geocode).not.toHaveBeenCalled();
  });

  it('reuses an existing locality by OSM identity and stores the typed input as an alias', async () => {
    const draft = {
      id: 'draft-id',
      name: 'Gerona',
      nameNormalized: 'gerona',
      provinceNormalized: 'gipuzkoa',
      administrativeRegionId: region.id,
      latitude: null,
      longitude: null,
      administrativeRegion: region,
    } as Locality;
    const canonical = {
      id: 'canonical-id',
      name: 'Girona',
      nameNormalized: 'girona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
      aliases: [],
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([]);
    localities.save
      .mockResolvedValueOnce(draft)
      .mockImplementation(async (value) => value);
    localities.findOne.mockResolvedValue(canonical);
    geocoder.geocode.mockResolvedValue({
      status: 'geocoded',
      latitude: 41.98,
      longitude: 2.82,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    await expect(
      service.resolveAndGeocode({ ...input, name: 'Gerona' }),
    ).resolves.toMatchObject({
      locality: { id: 'canonical-id', name: 'Girona' },
    });
    expect(localities.delete).toHaveBeenCalledWith('draft-id');
    expect(aliases.save).toHaveBeenCalledWith(
      expect.objectContaining({
        localityId: 'canonical-id',
        name: 'Gerona',
        normalizedName: 'gerona',
      }),
    );
  });

  it('reconciles a concurrent OSM uniqueness conflict by reusing the winning locality', async () => {
    const draft = {
      id: 'draft-id',
      name: 'Gerona',
      nameNormalized: 'gerona',
      provinceNormalized: 'gipuzkoa',
      administrativeRegionId: region.id,
      latitude: null,
      longitude: null,
      osmType: null,
      osmId: null,
      administrativeRegion: region,
    } as Locality;
    const canonical = {
      id: 'winner-id',
      name: 'Girona',
      nameNormalized: 'girona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
      aliases: [],
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([]);
    localities.save
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce({ code: '23505' });
    localities.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(canonical);
    geocoder.geocode.mockResolvedValue({
      status: 'geocoded',
      latitude: 41.98,
      longitude: 2.82,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    await expect(
      service.resolveAndGeocode({ ...input, name: 'Gerona' }),
    ).resolves.toMatchObject({
      locality: { id: 'winner-id' },
    });
    expect(localities.delete).toHaveBeenCalledWith('draft-id');
  });

  it('does not merge a pre-existing locality when its OSM identity belongs elsewhere', async () => {
    const existing = {
      id: 'legacy-id',
      name: 'Gerona',
      nameNormalized: 'gerona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
      latitude: null,
      longitude: null,
      administrativeRegion: region,
    } as Locality;
    const canonical = {
      id: 'canonical-id',
      name: 'Girona',
      nameNormalized: 'girona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
      aliases: [],
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([existing]);
    localities.findOne.mockResolvedValue(canonical);
    geocoder.geocode.mockResolvedValue({
      status: 'geocoded',
      latitude: 41.98,
      longitude: 2.82,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    await expect(
      service.resolveAndGeocode({ ...input, name: 'Gerona' }),
    ).rejects.toThrow('requires manual review');
    expect(localities.delete).not.toHaveBeenCalled();
    expect(aliases.save).not.toHaveBeenCalled();
  });

  it('does not delete a concurrent same-name winner after recovering the name constraint', async () => {
    const winner = {
      id: 'name-winner-id',
      name: 'Gerona',
      nameNormalized: 'gerona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
      latitude: null,
      longitude: null,
      administrativeRegion: region,
    } as Locality;
    const identityOwner = {
      id: 'osm-owner-id',
      name: 'Girona',
      nameNormalized: 'girona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
    } as Locality;
    localities.find.mockResolvedValueOnce([]).mockResolvedValueOnce([winner]);
    localities.save.mockRejectedValueOnce({ code: '23505' });
    localities.findOne.mockResolvedValue(identityOwner);
    geocoder.geocode.mockResolvedValue({
      status: 'geocoded',
      latitude: 41.98,
      longitude: 2.82,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    await expect(
      service.resolveAndGeocode({ ...input, name: 'Gerona' }),
    ).rejects.toThrow('requires manual review');
    expect(localities.delete).not.toHaveBeenCalled();
  });

  it('allows an alias matching another locality principal name and resolves principal names first', async () => {
    const principal = {
      id: 'principal-id',
      name: 'Gerona',
      nameNormalized: 'gerona',
      provinceNormalized: 'gipuzkoa',
      latitude: 43,
      longitude: -2,
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([principal]);
    await expect(
      service.resolveAndGeocode({ ...input, name: 'Gerona' }),
    ).resolves.toMatchObject({
      locality: { id: 'principal-id' },
    });
    expect(aliases.find).not.toHaveBeenCalled();
    expect(geocoder.geocode).not.toHaveBeenCalled();
  });

  it('adds and removes aliases without changing the canonical locality', async () => {
    const locality = {
      id: 'locality-id',
      name: 'Girona',
      nameNormalized: 'girona',
      aliases: [],
    } as Locality;
    localities.findOne.mockResolvedValue(locality);
    const added = await service.addAlias('locality-id', {
      name: 'Gerona',
      language: 'es',
    });
    expect(added).toMatchObject({
      locality: { name: 'Girona' },
      alias: { name: 'Gerona' },
    });
    expect(aliases.save).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedName: 'gerona', language: 'es' }),
    );
    aliases.findOne.mockResolvedValue({
      id: 'alias-id',
      localityId: 'locality-id',
    });
    await expect(
      service.removeAlias('locality-id', 'alias-id'),
    ).resolves.toMatchObject({ removed: true });
    expect(localities.delete).not.toHaveBeenCalled();
  });

  it('rejects aliases already associated with a different locality in the same context', async () => {
    const locality = {
      id: 'locality-id',
      name: 'Girona',
      nameNormalized: 'girona',
      administrativeRegionId: region.id,
      provinceNormalized: 'gipuzkoa',
      aliases: [],
    } as Locality;
    localities.findOne.mockResolvedValue(locality);
    aliases.find.mockResolvedValue([
      {
        localityId: 'other-id',
        locality: {
          id: 'other-id',
          administrativeRegionId: region.id,
          provinceNormalized: 'gipuzkoa',
        },
      },
    ]);
    await expect(
      service.addAlias('locality-id', { name: 'Gerona' }),
    ).rejects.toThrow('Alias would create an ambiguous locality match');
    expect(aliases.save).not.toHaveBeenCalled();
  });

  it('reuses a unique locality in the region when province is omitted', async () => {
    localities.find.mockResolvedValue([
      {
        id: 'existing-id',
        latitude: 43.3,
        longitude: -1.9,
        administrativeRegion: region,
      },
    ]);
    const withoutProvince: ResolveLocalityDto = {
      name: input.name,
      administrativeRegionId: input.administrativeRegionId,
    };
    await expect(
      service.resolveAndGeocode(withoutProvince),
    ).resolves.toMatchObject({ locality: { id: 'existing-id' } });
    expect(localities.create).not.toHaveBeenCalled();
  });

  it('returns ambiguous for homonymous localities within one region when province is not supplied', async () => {
    localities.find.mockResolvedValue([
      { id: 'one', province: 'Bizkaia', provinceNormalized: 'bizkaia' },
      { id: 'two', province: 'Gipuzkoa', provinceNormalized: 'gipuzkoa' },
    ]);
    const withoutProvince: ResolveLocalityDto = {
      name: input.name,
      administrativeRegionId: input.administrativeRegionId,
    };
    await expect(
      service.resolveAndGeocode(withoutProvince),
    ).resolves.toMatchObject({
      locality: null,
      geocoding: { status: 'ambiguous' },
    });
  });

  it('adds a supplied province to the only previously unqualified locality', async () => {
    const locality = {
      id: 'existing-id',
      province: null,
      provinceNormalized: '',
      latitude: 43.3,
      longitude: -1.9,
      administrativeRegion: region,
    } as Locality;
    localities.find.mockResolvedValue([locality]);
    await expect(service.resolveAndGeocode(input)).resolves.toMatchObject({
      locality: {
        id: 'existing-id',
        province: 'Gipuzkoa',
        provinceNormalized: 'gipuzkoa',
      },
    });
    expect(localities.save).toHaveBeenCalledWith(locality);
    expect(localities.create).not.toHaveBeenCalled();
  });

  it('resolves a region by country and normalized name', async () => {
    localities.find.mockResolvedValue([]);
    geocoder.geocode.mockResolvedValue({ status: 'unavailable' });
    await service.resolveAndGeocode({
      name: input.name,
      province: input.province,
      administrativeRegion: ' país   vasco ',
      countryId: 'country-id',
    });
    expect(regions.findByIdentity).toHaveBeenCalledWith(
      'country-id',
      'pais vasco',
    );
  });

  it('rejects a country that contradicts the selected region', async () => {
    await expect(
      service.resolveAndGeocode({ ...input, countryId: 'other-country' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(localities.find).not.toHaveBeenCalled();
  });
});
