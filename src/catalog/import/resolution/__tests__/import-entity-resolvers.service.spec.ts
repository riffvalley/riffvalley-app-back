import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { Locality } from '../../../venues/entities/locality.entity';
import { Venue } from '../../../venues/entities/venue.entity';
import { Tour } from '../../../tours/entities/tour.entity';
import { NominatimGeocoderService } from '../../../venues/localities/nominatim-geocoder.service';
import { VenuesService } from '../../../venues/venues.service';
import { ImportEntityResolversService } from '../import-entity-resolvers.service';

function createService(
  dataSource: DataSource,
  geocode = jest.fn(),
  suppliedVenuesService?: VenuesService,
): ImportEntityResolversService {
  const geocoder = Object.create(
    NominatimGeocoderService.prototype,
  ) as NominatimGeocoderService;
  Object.assign(geocoder, { geocode });
  const venuesService =
    suppliedVenuesService ??
    (Object.create(VenuesService.prototype) as VenuesService);
  return new ImportEntityResolversService(dataSource, geocoder, venuesService);
}

function queryBuilder<T>(rows: T[]): SelectQueryBuilder<T> {
  const builder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  const instance = Object.create(
    SelectQueryBuilder.prototype,
  ) as SelectQueryBuilder<T>;
  Object.assign(instance, builder);
  return instance;
}

describe('ImportEntityResolversService', () => {
  it('reports ambiguous normalized artist identity without creating an artist', async () => {
    const candidates = [
      { id: 'artist-a', name: 'The Example' },
      { id: 'artist-b', name: 'THE  EXAMPLE!' },
    ];
    const artistRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder(candidates)),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(artistRepository),
    }) as DataSource;
    const service = createService(dataSource);

    const [result] = await service.inspectArtists([' the example ']);

    expect(result).toMatchObject({
      status: 'ambiguous',
      code: 'ARTIST_AMBIGUOUS',
    });
    expect(result.candidates).toHaveLength(2);
    expect(artistRepository).not.toHaveProperty('save');
  });

  it('uses an explicit artist ID to resolve an otherwise ambiguous name and validates the name', async () => {
    const candidates = [
      { id: 'artist-a', name: 'The Example' },
      { id: 'artist-b', name: 'THE  EXAMPLE!' },
    ];
    const builder = queryBuilder(candidates);
    const artistRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(artistRepository),
    }) as DataSource;
    const service = createService(dataSource);

    const [selected] = await service.inspectArtists(
      [' the example '],
      ['artist-b'],
    );
    const [mismatched] = await service.inspectArtists(
      ['Different Artist'],
      ['artist-b'],
    );

    expect(selected).toEqual({
      status: 'existing',
      entity: { id: 'artist-b', name: 'THE  EXAMPLE!' },
    });
    expect(mismatched).toEqual({
      status: 'invalid',
      code: 'ARTIST_ID_NAME_MISMATCH',
    });
    expect(builder.where).toHaveBeenCalledWith(
      expect.stringContaining('artist.id IN (:...explicitIds)'),
      expect.objectContaining({ explicitIds: ['artist-b'] }),
    );
  });

  it('serializes artist materialization and reuses the winner found inside the transaction', async () => {
    const candidate = { id: 'artist-id', name: 'Example' };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder([candidate])),
      create: jest.fn(),
      save: jest.fn(),
    };
    const manager = Object.create(EntityManager.prototype) as EntityManager;
    Object.assign(manager, {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(repository),
    });
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
    );

    const result = await service.materializeArtist('EXAMPLE', manager);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['example'],
    );
    expect(result).toEqual({ status: 'existing', entity: candidate });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('creates a minimal reviewable artist and reuses normalized variations', async () => {
    const createdArtist = {
      id: 'new-artist-id',
      name: 'Björk + Co',
      nameNormalized: 'bjork + co',
      searchNameNormalized: 'bjork co',
      needsReview: true,
    };
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(queryBuilder([]))
        .mockReturnValue(queryBuilder([createdArtist])),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(createdArtist),
    };
    const manager = Object.create(EntityManager.prototype) as EntityManager;
    Object.assign(manager, {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(repository),
    });
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
    );

    const first = await service.materializeArtist('Björk + Co', manager);
    const repeated = await service.materializeArtist(' BJORK   CO ', manager);

    expect(first).toEqual({
      status: 'created',
      entity: { id: 'new-artist-id', name: 'Björk + Co' },
    });
    expect(repeated).toEqual({
      status: 'existing',
      entity: { id: 'new-artist-id', name: 'Björk + Co' },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Björk + Co',
        needsReview: true,
        searchNameNormalized: 'bjork co',
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('requires locality context before proposing an unknown city for creation', async () => {
    const builder = queryBuilder<Locality>([]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as DataSource;
    const service = createService(dataSource);

    const result = await service.inspectLocality({ city: 'New City' });

    expect(result).toEqual({
      status: 'invalid',
      code: 'LOCALITY_CONTEXT_REQUIRED',
    });
  });

  it('reuses an explicit locality UUID and checks country, region, city, and province context', async () => {
    const locality = Object.assign(new Locality(), {
      id: 'locality-id',
      name: 'Madrid',
      nameNormalized: 'madrid',
      provinceNormalized: 'madrid',
      administrativeRegionId: 'region-id',
      administrativeRegion: { countryId: 'country-id' },
      aliases: [{ normalizedName: 'villa de madrid' }],
    });
    const repository = { findOne: jest.fn().mockResolvedValue(locality) };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as DataSource;
    const service = createService(dataSource);

    const compatible = await service.inspectLocality({
      city: ' MADRID ',
      province: 'Madrid',
      localityId: 'locality-id',
      countryId: 'country-id',
      administrativeRegionId: 'region-id',
    });
    const wrongProvince = await service.inspectLocality({
      city: 'Madrid',
      province: 'Barcelona',
      localityId: 'locality-id',
      countryId: 'country-id',
    });
    const wrongCountry = await service.inspectLocality({
      city: 'Madrid',
      localityId: 'locality-id',
      countryId: 'other-country',
    });
    const normalizedAlias = await service.inspectLocality({
      city: 'Villa   de Madrid',
      localityId: 'locality-id',
      countryId: 'country-id',
    });

    expect(compatible).toEqual({ status: 'existing', entity: locality });
    expect(wrongProvince).toEqual({
      status: 'invalid',
      code: 'LOCALITY_ID_PROVINCE_MISMATCH',
    });
    expect(wrongCountry).toEqual({
      status: 'invalid',
      code: 'LOCALITY_ID_COUNTRY_MISMATCH',
    });
    expect(normalizedAlias).toEqual({ status: 'existing', entity: locality });
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'locality-id' } }),
    );
  });

  it('returns row-level errors for missing locality and venue UUIDs and a mismatched administrative region', async () => {
    const locality = Object.assign(new Locality(), {
      id: 'locality-id',
      name: 'Madrid',
      nameNormalized: 'madrid',
      provinceNormalized: 'madrid',
      administrativeRegionId: 'region-id',
      administrativeRegion: { countryId: 'country-id' },
      aliases: [],
    });
    const localityRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(locality),
    };
    const venueRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn((entity: unknown) =>
        entity === Venue ? venueRepository : localityRepository,
      ),
    }) as DataSource;
    const service = createService(dataSource);

    const missingLocality = await service.inspectLocality({
      city: 'Madrid',
      localityId: 'missing-locality-id',
      countryId: 'country-id',
    });
    const wrongRegion = await service.inspectLocality({
      city: 'Madrid',
      localityId: 'locality-id',
      countryId: 'country-id',
      administrativeRegionId: 'other-region-id',
    });
    const missingVenue = await service.inspectLocality({
      city: 'Madrid',
      venueId: 'missing-venue-id',
      countryId: 'country-id',
    });

    expect(missingLocality).toEqual({
      status: 'invalid',
      code: 'LOCALITY_ID_NOT_FOUND',
    });
    expect(wrongRegion).toEqual({
      status: 'invalid',
      code: 'LOCALITY_ID_REGION_MISMATCH',
    });
    expect(missingVenue).toEqual({
      status: 'invalid',
      code: 'VENUE_ID_NOT_FOUND',
    });
  });

  it('derives and validates the locality from an explicit venue UUID', async () => {
    const locality = Object.assign(new Locality(), {
      id: 'venue-locality-id',
      name: 'Madrid',
      nameNormalized: 'madrid',
      provinceNormalized: 'madrid',
      administrativeRegionId: 'region-id',
      administrativeRegion: { countryId: 'country-id' },
      aliases: [],
    });
    const venue = Object.assign(new Venue(), {
      id: 'venue-id',
      localityId: locality.id,
      locality,
    });
    const venueRepository = { findOne: jest.fn().mockResolvedValue(venue) };
    const localityRepository = {
      findOne: jest.fn().mockResolvedValue(
        Object.assign(new Locality(), {
          id: 'different-locality-id',
          name: 'Madrid',
          nameNormalized: 'madrid',
          provinceNormalized: 'madrid',
          administrativeRegionId: 'region-id',
          administrativeRegion: { countryId: 'country-id' },
          aliases: [],
        }),
      ),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn((entity: unknown) =>
        entity === Venue ? venueRepository : localityRepository,
      ),
    }) as DataSource;
    const service = createService(dataSource);

    const result = await service.inspectLocality({
      city: 'Madrid',
      venueId: venue.id,
      countryId: 'country-id',
      administrativeRegionId: 'region-id',
    });
    const mismatchedVenueName = await service.inspectLocality({
      city: 'Madrid',
      venueId: venue.id,
      venueName: 'Different Venue',
      countryId: 'country-id',
    });
    const incompatible = await service.inspectLocality({
      city: 'Madrid',
      venueId: venue.id,
      localityId: 'different-locality-id',
      countryId: 'country-id',
    });

    expect(result).toEqual({
      status: 'existing',
      entity: locality,
      selectedVenue: venue,
    });
    expect(mismatchedVenueName).toEqual({
      status: 'invalid',
      code: 'VENUE_ID_NAME_MISMATCH',
    });
    expect(incompatible).toEqual({
      status: 'invalid',
      code: 'VENUE_LOCALITY_MISMATCH',
    });
  });

  it('reuses the explicit venue inside the transaction and validates name and locality', async () => {
    const venue = Object.assign(new Venue(), {
      id: 'venue-id',
      localityId: 'locality-id',
      nameNormalized: 'la riviera',
      isGeneric: false,
    });
    const repository = { findOneBy: jest.fn().mockResolvedValue(venue) };
    const manager = Object.assign(Object.create(EntityManager.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as EntityManager;
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
    );

    const result = await service.materializeVenue(
      ' LA   RIVIERA ',
      'locality-id',
      manager,
      'venue-id',
    );
    const mismatch = await service.materializeVenue(
      'Different Venue',
      'locality-id',
      manager,
      'venue-id',
    );

    expect(result).toEqual({ status: 'existing', entity: venue });
    expect(mismatch).toEqual({
      status: 'invalid',
      code: 'VENUE_ID_NAME_MISMATCH',
    });
  });

  it('reuses an explicitly selected generic venue instead of creating or substituting one', async () => {
    const genericVenue = Object.assign(new Venue(), {
      id: 'generic-venue-id',
      localityId: 'locality-id',
      nameNormalized: 'madrid',
      isGeneric: true,
    });
    const repository = { findOneBy: jest.fn().mockResolvedValue(genericVenue) };
    const manager = Object.assign(Object.create(EntityManager.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as EntityManager;
    const getOrCreateGenericVenueWithStatus = jest.fn();
    const venuesService = Object.assign(
      Object.create(VenuesService.prototype) as VenuesService,
      { getOrCreateGenericVenueWithStatus },
    );
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
      jest.fn(),
      venuesService,
    );

    const result = await service.materializeVenue(
      null,
      'locality-id',
      manager,
      genericVenue.id,
    );

    expect(result).toEqual({ status: 'existing', entity: genericVenue });
    expect(getOrCreateGenericVenueWithStatus).not.toHaveBeenCalled();
  });

  it('geocodes a new locality once per normalized batch key without persisting it', async () => {
    const localityBuilder = queryBuilder<Locality>([]);
    const localityRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(localityBuilder),
      save: jest.fn(),
    };
    const region = Object.assign(
      {},
      { id: 'region-id', countryId: 'country-id', name: 'Region' },
    );
    const regionRepository = { findOne: jest.fn().mockResolvedValue(region) };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn((entity: unknown) =>
        entity === Locality ? localityRepository : regionRepository,
      ),
    }) as DataSource;
    const geocode = jest.fn().mockResolvedValue({
      status: 'geocoded',
      latitude: 1,
      longitude: 2,
      osmType: 'relation',
      osmId: '123',
      aliases: [],
    });
    const service = createService(dataSource, geocode);
    const input = {
      city: 'New City',
      countryId: 'country-id',
      administrativeRegionId: 'region-id',
    };

    const results = await service.prepareLocalities([
      input,
      { ...input, city: '  NEW   CITY ' },
    ]);

    expect(results.map((result) => result.resolution.status)).toEqual([
      'created',
      'created',
    ]);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(localityRepository.save).not.toHaveBeenCalled();
  });

  it('returns candidates when a locality name remains ambiguous', async () => {
    const candidates = [
      Object.assign(new Locality(), {
        id: 'locality-a',
        name: 'San Pedro',
        province: 'North',
        administrativeRegion: {
          name: 'Region',
          country: { name: 'Country' },
        },
      }),
      Object.assign(new Locality(), {
        id: 'locality-b',
        name: 'San Pedro',
        province: 'South',
        administrativeRegion: {
          name: 'Region',
          country: { name: 'Country' },
        },
      }),
    ];
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder(candidates)),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as DataSource;
    const service = createService(dataSource);

    const result = await service.inspectLocality({
      city: 'San Pedro',
      countryId: 'country-id',
    });

    expect(result).toMatchObject({
      status: 'ambiguous',
      code: 'LOCALITY_AMBIGUOUS',
    });
    expect(result.candidates).toHaveLength(2);
  });

  it('reuses only a physical venue for the normalized locality identity', async () => {
    const venue = { id: 'venue-id', name: 'La Riviera', isGeneric: false };
    const repository = { findOneBy: jest.fn().mockResolvedValue(venue) };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as DataSource;
    const service = createService(dataSource);

    const result = await service.inspectVenue(' LA   RIVIERA ', 'locality-id');

    expect(result).toEqual({ status: 'existing', entity: venue });
    expect(repository.findOneBy).toHaveBeenCalledWith({
      localityId: 'locality-id',
      nameNormalized: 'la riviera',
      isGeneric: false,
    });
  });

  it('delegates generic venue materialization to the idempotent venue service', async () => {
    const venue = { id: 'generic-id', isGeneric: true };
    const venuesService = Object.create(
      VenuesService.prototype,
    ) as VenuesService;
    const getOrCreateGenericVenueWithStatus = jest
      .fn()
      .mockResolvedValue({ venue, status: 'existing' });
    Object.assign(venuesService, { getOrCreateGenericVenueWithStatus });
    const manager = Object.create(EntityManager.prototype) as EntityManager;
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
      jest.fn(),
      venuesService,
    );

    const result = await service.materializeVenue(null, 'locality-id', manager);

    expect(result).toEqual({
      status: 'existing',
      entity: venue,
      code: 'VENUE_GENERIC',
    });
    expect(getOrCreateGenericVenueWithStatus).toHaveBeenCalledWith(
      'locality-id',
      manager,
    );
  });

  it('inspects multiple tours in one query and requires confirmation for matches', async () => {
    const tour = Object.assign(new Tour(), {
      id: 'tour-id',
      name: 'European Tour 2027',
      normalizedName: 'european tour 2027',
    });
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([tour]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as DataSource;
    const service = createService(dataSource);

    const result = await service.inspectTours([
      'EUROPEAN  TOUR 2027',
      'New Tour',
      '   ',
    ]);

    expect(result).toEqual([
      {
        status: 'conflict',
        code: 'TOUR_CONFIRMATION_REQUIRED',
        entity: tour,
      },
      { status: 'created' },
      { status: 'invalid', code: 'TOUR_NAME_INVALID' },
    ]);
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('tour');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'tour.normalizedName IN (:...normalizedNames)',
      { normalizedNames: ['european tour 2027', 'new tour'] },
    );
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('preserves single-tour inspection through the batch resolver', async () => {
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    });
    const service = createService(dataSource as DataSource);

    await expect(service.inspectTour('EUROPEAN  TOUR 2027')).resolves.toEqual({
      status: 'created',
    });
  });

  it('rejects a materialized tour name collision unless the existing ID was confirmed', async () => {
    const tour = Object.assign(new Tour(), {
      id: 'tour-id',
      normalizedName: 'european tour 2027',
    });
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(tour),
      save: jest.fn(),
    };
    const manager = Object.assign(Object.create(EntityManager.prototype), {
      getRepository: jest.fn().mockReturnValue(repository),
    }) as EntityManager;
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
    );

    const pending = await service.materializeTour(
      'European Tour 2027',
      null,
      manager,
    );
    const confirmed = await service.materializeTour(
      'European Tour 2027',
      'tour-id',
      manager,
    );

    expect(pending).toMatchObject({
      status: 'conflict',
      code: 'TOUR_CONFIRMATION_REQUIRED',
    });
    expect(confirmed).toEqual({ status: 'existing', entity: tour });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('shares a tour created in the same transaction context across rows', async () => {
    const tour = Object.assign(new Tour(), {
      id: 'batch-tour-id',
      name: 'European Tour 2027',
      normalizedName: 'european tour 2027',
    });
    const repository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(tour),
    };
    const manager = Object.create(EntityManager.prototype) as EntityManager;
    Object.assign(manager, {
      getRepository: jest.fn().mockReturnValue(repository),
      query: jest.fn((sql: string) =>
        sql.startsWith('INSERT') ? [{ id: tour.id }] : [],
      ),
    });
    const service = createService(
      Object.create(DataSource.prototype) as DataSource,
    );
    const context = { createdTours: new Map<string, Tour>() };

    const first = await service.materializeTour(
      'European Tour 2027',
      null,
      manager,
      context,
    );
    const second = await service.materializeTour(
      'European Tour 2027',
      null,
      manager,
      context,
    );

    expect(first).toEqual({ status: 'created', entity: tour });
    expect(second).toEqual({ status: 'existing', entity: tour });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("normalized_name") DO NOTHING'),
      ['European Tour 2027', 'european tour 2027'],
    );
  });

  it('does not attempt entity queries for an invalid artist name', async () => {
    const dataSource = Object.assign(Object.create(DataSource.prototype), {
      getRepository: jest.fn(),
    }) as DataSource;
    const service = createService(dataSource);

    await expect(
      service.materializeArtist('   ', {} as EntityManager),
    ).resolves.toEqual({ status: 'invalid', code: 'ARTIST_NAME_INVALID' });
    expect(dataSource.getRepository).not.toHaveBeenCalled();
  });
});
