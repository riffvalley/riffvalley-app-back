import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ConfigService } from '@nestjs/config';
import { Logger as TypeOrmLogger } from 'typeorm';
import { DataSource } from 'typeorm';
import { Artist } from '../../../artists/entities/artist.entity';
import { normalizeForSearch } from '../../../artists/helpers/normalize-for-search';
import { Event } from '../../entities/event.entity';
import { ImportEventsBatchDto } from '../../dto/import-batch.dto';
import { ImportEventRowDto } from '../../dto/import-event-row.dto';
import { ImportLineupSourceDto } from '../../dto/import-lineup.dto';
import { EventsImportBatchService } from '../events-import-batch.service';
import { ImportEventLineupService } from '../../import-lineup/import-event-lineup.service';
import { ImportConflictsService } from '../../../import/conflicts/import-conflicts.service';
import { ImportEntityResolversService } from '../../../import/resolution/import-entity-resolvers.service';
import { ImportRowReceiptsService } from '../../../import/receipts/import-row-receipts.service';
import { NominatimGeocoderService } from '../../../venues/localities/nominatim-geocoder.service';
import { Locality } from '../../../venues/entities/locality.entity';
import { LocalityAlias } from '../../../venues/entities/locality-alias.entity';
import { Venue } from '../../../venues/entities/venue.entity';
import { VenuesService } from '../../../venues/venues.service';
import { LocalitiesService } from '../../../venues/localities/localities.service';
import { Country } from '../../../countries/entities/country.entity';
import { AdministrativeRegion } from '../../../administrative-regions/entities/administrative-region.entity';
import { AdministrativeRegionsService } from '../../../administrative-regions/administrative-regions.service';

const enabled = process.env.CON_B04F_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;
const repetitions = 3;

class QueryCounter implements TypeOrmLogger {
  queryCount = 0;
  queryErrors = 0;

  reset(): void {
    this.queryCount = 0;
    this.queryErrors = 0;
  }

  logQuery(): void {
    this.queryCount += 1;
  }

  logQueryError(): void {
    this.queryErrors += 1;
  }

  logQuerySlow(): void {}

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(): void {}
}

function assertDockerTarget(): void {
  if (
    process.env.STAGE !== 'dev' ||
    process.env.DB_HOST !== '127.0.0.1' ||
    process.env.DB_PORT !== '55472' ||
    process.env.DB_NAME !== 'con_b04f_events' ||
    process.env.CON_B04F_DB_NAME !== process.env.DB_NAME ||
    process.env.DB_USERNAME !== 'con_b04f_runner' ||
    process.env.DATABASE_URL
  ) {
    throw new Error(
      'CON-B04f Event integration requires its dedicated Docker PostgreSQL target.',
    );
  }
}

function row(
  rowId: string,
  startDate: string,
  lineup: Array<{ name: string; artistId?: string | null }>,
  values: Partial<ImportEventRowDto> = {},
): ImportEventRowDto {
  return {
    rowId,
    type: 'concert',
    name: null,
    lineup,
    startDate,
    city: 'Madrid',
    province: 'Madrid',
    administrativeRegionId: values.administrativeRegionId,
    venue: 'La Riviera',
    ...values,
  };
}

function batch(
  rows: ImportEventRowDto[],
  batchId = randomUUID(),
): ImportEventsBatchDto {
  return { batchId, countryId: 'country-placeholder', rows };
}

function dateAt(dayOffset: number): string {
  const date = new Date(Date.UTC(2030, 0, 1 + dayOffset));
  return date.toISOString().slice(0, 10);
}

integrationSuite('Concert import PostgreSQL integration and benchmark', () => {
  let dataSource: DataSource;
  let logger: QueryCounter;
  let batchService: EventsImportBatchService;
  let lineupService: ImportEventLineupService;
  let countryId: string;
  let regionId: string;
  let localityId: string;
  let editorId: string;
  let artistIds: Map<string, string>;
  let tourConcertIds: string[];
  let existingBenchmarkLocalities: Array<{
    city: string;
    province: string;
    administrativeRegionId: string;
  }>;

  beforeAll(async () => {
    assertDockerTarget();
    logger = new QueryCounter();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: [`${process.cwd()}/src/**/*.entity.ts`],
      migrations: [],
      synchronize: false,
      migrationsRun: false,
      logging: true,
      logger,
      extra: { max: 20 },
    });
    await dataSource.initialize();
    const identity = (await dataSource.query(
      `SELECT current_database() AS database, current_user AS username,
              current_setting('server_version_num') AS server_version_num,
              inet_server_port() AS server_port`,
    )) as Array<{
      database: string;
      username: string;
      server_version_num: string;
      server_port: number;
    }>;
    expect(identity[0]).toMatchObject({
      database: 'con_b04f_events',
      username: 'con_b04f_runner',
      server_port: 5432,
    });
    expect(identity[0].server_version_num.startsWith('16')).toBe(true);
    const schema = (await dataSource.query(
      `SELECT count(*)::int AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN
         ('events', 'event_artists', 'tours', 'catalog_import_row_receipts')`,
    )) as Array<{ count: number }>;
    expect(schema[0].count).toBe(4);

    countryId = randomUUID();
    regionId = randomUUID();
    localityId = randomUUID();
    editorId = randomUUID();
    await dataSource.query(
      'INSERT INTO "country" ("id", "name", "isoCode") VALUES ($1, $2, $3)',
      [countryId, 'Spain', 'ES-B04F'],
    );
    await dataSource.query(
      `INSERT INTO "administrative_regions" ("id", "name", "name_normalized", "code", "country_id")
       VALUES ($1, 'Community of Madrid', 'community of madrid', 'B04F-MD', $2)`,
      [regionId, countryId],
    );
    await dataSource.query(
      `INSERT INTO "localities" ("id", "name", "name_normalized", "province", "province_normalized", "administrative_region_id")
       VALUES ($1, 'Madrid', 'madrid', 'Madrid', 'madrid', $2)`,
      [localityId, regionId],
    );
    existingBenchmarkLocalities = [
      { city: 'Madrid', province: 'Madrid', administrativeRegionId: regionId },
    ];
    const otherCities = [
      {
        city: 'Barcelona',
        province: 'Barcelona',
        region: 'Catalonia',
        code: 'B04F-CT',
      },
      {
        city: 'Bilbao',
        province: 'Biscay',
        region: 'Basque Country',
        code: 'B04F-BC',
      },
      {
        city: 'Valencia',
        province: 'Valencia',
        region: 'Valencian Community',
        code: 'B04F-VC',
      },
    ];
    for (const city of otherCities) {
      const cityRegionId = randomUUID();
      await dataSource.query(
        `INSERT INTO "administrative_regions" ("id", "name", "name_normalized", "code", "country_id")
         VALUES ($1, $2, $3, $4, $5)`,
        [
          cityRegionId,
          city.region,
          normalizeForSearch(city.region),
          city.code,
          countryId,
        ],
      );
      await dataSource.query(
        `INSERT INTO "localities" ("name", "name_normalized", "province", "province_normalized", "administrative_region_id")
         VALUES ($1, $2, $3, $4, $5)`,
        [
          city.city,
          normalizeForSearch(city.city),
          city.province,
          normalizeForSearch(city.province),
          cityRegionId,
        ],
      );
      existingBenchmarkLocalities.push({
        city: city.city,
        province: city.province,
        administrativeRegionId: cityRegionId,
      });
    }
    await dataSource.query('INSERT INTO "users" ("id") VALUES ($1)', [
      editorId,
    ]);

    const venue = await dataSource.getRepository(Venue).save(
      dataSource.getRepository(Venue).create({
        name: 'La Riviera',
        nameNormalized: 'la riviera',
        type: 'concert_hall',
        status: 'active',
        localityId,
        isGeneric: false,
      }),
    );
    expect(venue.id).toBeDefined();
    for (const locality of existingBenchmarkLocalities) {
      const location = await dataSource.getRepository(Locality).findOneBy({
        nameNormalized: normalizeForSearch(locality.city),
        administrativeRegionId: locality.administrativeRegionId,
      });
      expect(location).not.toBeNull();
      if (!location) throw new Error('Benchmark locality fixture missing');
      await dataSource.getRepository(Venue).save(
        dataSource.getRepository(Venue).create({
          name: `Benchmark Hall ${locality.city}`,
          nameNormalized: normalizeForSearch(`Benchmark Hall ${locality.city}`),
          type: 'concert_hall',
          status: 'active',
          localityId: location.id,
          isGeneric: false,
        }),
      );
    }
    artistIds = new Map();
    for (const name of [
      'Septicflesh',
      'Kvelertak',
      'Gojira',
      'Kreator',
      'Emperor',
    ]) {
      const artist = await dataSource.getRepository(Artist).save(
        dataSource.getRepository(Artist).create({
          name,
          nameNormalized: normalizeForSearch(name),
          searchNameNormalized: name.toLowerCase(),
          needsReview: false,
        }),
      );
      artistIds.set(name, artist.id);
    }

    const venuesService = new VenuesService(
      dataSource.getRepository(Venue),
      dataSource.getRepository(Locality),
    );
    const geocoder = new NominatimGeocoderService(
      dataSource,
      new ConfigService({
        GEOCODING_PROVIDER_URL: process.env.GEOCODING_PROVIDER_URL,
      }),
    );
    const resolvers = new ImportEntityResolversService(
      dataSource,
      geocoder,
      venuesService,
    );
    const conflicts = new ImportConflictsService(
      dataSource.getRepository(Event),
    );
    const receipts = new ImportRowReceiptsService(dataSource);
    batchService = new EventsImportBatchService(resolvers, conflicts, receipts);
    lineupService = new ImportEventLineupService(
      resolvers,
      conflicts,
      receipts,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('inspects locality aliases in PostgreSQL with a fixed grouped query count and no geocoding', async () => {
    await dataSource.getRepository(LocalityAlias).save(
      dataSource.getRepository(LocalityAlias).create({
        localityId,
        name: 'Villa de Madrid',
        normalizedName: 'villa de madrid',
        language: 'es',
        kind: 'alternate',
      }),
    );
    const countryRepository = dataSource.getRepository(Country);
    const regionRepository = dataSource.getRepository(AdministrativeRegion);
    const geocoder = new NominatimGeocoderService(
      dataSource,
      new ConfigService({
        GEOCODING_PROVIDER_URL: process.env.GEOCODING_PROVIDER_URL,
      }),
    );
    const geocodeSpy = jest.spyOn(geocoder, 'geocode');
    const localityService = new LocalitiesService(
      dataSource.getRepository(Locality),
      dataSource.getRepository(LocalityAlias),
      countryRepository,
      regionRepository,
      new AdministrativeRegionsService(regionRepository, countryRepository),
      geocoder,
    );
    logger.reset();

    await expect(
      localityService.inspectBatch({
        localities: [
          {
            name: 'Madrid',
            countryId,
            administrativeRegionId: regionId,
          },
          {
            name: 'Villa de Madrid',
            countryId,
            administrativeRegionId: regionId,
          },
        ],
      }),
    ).resolves.toMatchObject({
      results: [
        { index: 0, status: 'existing', locality: { id: localityId } },
        { index: 1, status: 'existing', locality: { id: localityId } },
      ],
    });
    expect(logger.queryCount).toBe(3);
    expect(geocodeSpy).not.toHaveBeenCalled();
  });

  it('imports three concerts with one shared Tour and replays the exact batch idempotently', async () => {
    const batchId = randomUUID();
    const rows = [
      row(randomUUID(), '2027-10-20', [{ name: 'Septicflesh' }], {
        type: 'tour',
        name: 'Septicflesh European Tour 2027',
        administrativeRegionId: regionId,
      }),
      row(randomUUID(), '2027-10-22', [{ name: 'Septicflesh' }], {
        type: 'tour',
        name: 'Septicflesh European Tour 2027',
        administrativeRegionId: regionId,
      }),
      row(randomUUID(), '2027-10-24', [{ name: 'Septicflesh' }], {
        type: 'tour',
        name: 'Septicflesh European Tour 2027',
        administrativeRegionId: regionId,
      }),
    ];
    const request = batch(rows, batchId);
    request.countryId = countryId;

    const created = await batchService.importBatch(editorId, request);
    expect(created.results.map((result) => result.status)).toEqual([
      'created',
      'created',
      'created',
    ]);
    tourConcertIds = created.results.flatMap((result) =>
      result.status === 'created' && result.eventId ? [result.eventId] : [],
    );
    expect(tourConcertIds).toHaveLength(3);
    const persisted = (await dataSource.query(
      `SELECT event."id", event."tour_id", event."type", lineup."id" AS event_artist_id,
              lineup."artist_id", lineup."tour_id" AS performance_tour_id, lineup."position"
       FROM "events" event
       JOIN "event_artists" lineup ON lineup."event_id" = event."id"
       WHERE event."id" = ANY($1::uuid[])
       ORDER BY event."start_date"`,
      [tourConcertIds],
    )) as Array<{
      id: string;
      tour_id: string;
      type: string;
      event_artist_id: string;
      artist_id: string;
      performance_tour_id: string | null;
      position: number;
    }>;
    expect(persisted).toHaveLength(3);
    expect(new Set(persisted.map((item) => item.tour_id)).size).toBe(1);
    expect(new Set(persisted.map((item) => item.event_artist_id)).size).toBe(3);
    expect(persisted.every((item) => item.type === 'concert')).toBe(true);
    expect(persisted.every((item) => item.performance_tour_id === null)).toBe(
      true,
    );
    expect(persisted.every((item) => item.position === 1)).toBe(true);
    const beforeReplay = (await dataSource.query(
      'SELECT count(*)::int AS count FROM "events" WHERE "id" = ANY($1::uuid[])',
      [tourConcertIds],
    )) as Array<{ count: number }>;

    const replay = await batchService.importBatch(editorId, request);
    expect(replay.results.every((result) => result.replayed === true)).toBe(
      true,
    );
    const afterReplay = (await dataSource.query(
      'SELECT count(*)::int AS count FROM "events" WHERE "id" = ANY($1::uuid[])',
      [tourConcertIds],
    )) as Array<{ count: number }>;
    expect(afterReplay[0].count).toBe(beforeReplay[0].count);
  });

  it('keeps import rows partial and creates no artists for rejected rows', async () => {
    const rejectedName = 'Do Not Materialize Artist';
    const validRow = row(randomUUID(), '2027-12-01', [
      { name: 'New Benchmark Artist' },
    ]);
    const conflictRow = row(randomUUID(), '2027-10-20', [
      { name: 'Septicflesh' },
      { name: rejectedName },
    ]);
    const invalidRow = row(randomUUID(), '2027-02-30', [{ name: 'Emperor' }]);
    for (const item of [validRow, conflictRow, invalidRow])
      item.administrativeRegionId = regionId;
    const request = batch([conflictRow, invalidRow, validRow]);
    request.countryId = countryId;

    const result = await batchService.importBatch(editorId, request);
    expect(result.results.map((item) => item.status)).toEqual([
      'conflict',
      'invalid',
      'created',
    ]);
    const rejectedArtists = (await dataSource.query(
      'SELECT "id" FROM "artist" WHERE "search_name_normalized" = $1',
      [rejectedName.toLowerCase()],
    )) as Array<{ id: string }>;
    expect(rejectedArtists).toHaveLength(0);
    const createdArtist = (await dataSource.query(
      'SELECT "id" FROM "artist" WHERE "search_name_normalized" = $1',
      ['new benchmark artist'],
    )) as Array<{ id: string }>;
    expect(createdArtist).toHaveLength(1);
  });

  it('allows a multi-day festival beside a concert, rejects same-day participation and detects festival duplicates', async () => {
    const multiDay = row(
      randomUUID(),
      '2027-10-20',
      [{ name: 'Septicflesh' }, { name: 'Emperor' }],
      {
        type: 'festival',
        name: 'Docker Fest',
        endDate: '2027-10-22',
        venue: null,
      },
    );
    multiDay.administrativeRegionId = regionId;
    const request = batch([multiDay]);
    request.countryId = countryId;
    const created = await batchService.importBatch(editorId, request);
    expect(created.results[0].status).toBe('created');

    const singleDay = row(
      randomUUID(),
      '2027-10-20',
      [{ name: 'Septicflesh' }],
      {
        type: 'festival',
        name: 'Single Day Conflict',
        venue: null,
      },
    );
    singleDay.administrativeRegionId = regionId;
    const conflictRequest = batch([singleDay]);
    conflictRequest.countryId = countryId;
    const conflict = await batchService.importBatch(editorId, conflictRequest);
    expect(conflict.results[0].status).toBe('conflict');

    const duplicate = row(randomUUID(), '2027-10-20', [{ name: 'Kreator' }], {
      type: 'festival',
      name: 'DOCKER   FEST',
      endDate: '2027-10-22',
      venue: null,
    });
    duplicate.administrativeRegionId = regionId;
    const duplicateRequest = batch([duplicate]);
    duplicateRequest.countryId = countryId;
    const duplicateResult = await batchService.importBatch(
      editorId,
      duplicateRequest,
    );
    expect(duplicateResult.results[0].status).toBe('conflict');

    const festivalId = created.results[0].eventId;
    const festivalLineup = (await dataSource.query(
      'SELECT "tour_id" FROM "event_artists" WHERE "event_id" = $1',
      [festivalId],
    )) as Array<{ tour_id: string | null }>;
    expect(festivalLineup.every((item) => item.tour_id === null)).toBe(true);
    const genericVenues = (await dataSource.query(
      'SELECT count(*)::int AS count FROM "venues" WHERE "locality_id" = $1 AND "is_generic" = true',
      [localityId],
    )) as Array<{ count: number }>;
    expect(genericVenues[0].count).toBe(1);
  });

  it('adds confirmed lineup entries additively and preserves Event and existing positions', async () => {
    const eventId = tourConcertIds[0];
    await dataSource.query(
      `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position", "tour_id")
       VALUES ($1, $2, 'Kvelertak', 2, NULL)`,
      [eventId, artistIds.get('Kvelertak')],
    );
    const original = (await dataSource.query(
      `SELECT "name", "type", "start_date", "end_date", "venue_id", "tour_id", "price", "other_info"
       FROM "events" WHERE "id" = $1`,
      [eventId],
    )) as Array<Record<string, unknown>>;
    const rowId = randomUUID();
    const sourceRow: ImportLineupSourceDto = {
      rowId,
      type: 'concert',
      name: null,
      lineup: [
        { name: 'Septicflesh', artistId: artistIds.get('Septicflesh') },
        { name: 'Gojira', artistId: artistIds.get('Gojira') },
      ],
      startDate: '2027-10-20',
      city: 'Madrid',
      province: 'Madrid',
      countryId,
      administrativeRegionId: regionId,
    };
    const dto = {
      batchId: randomUUID(),
      rowId,
      sourceRow,
      artists: [{ name: 'Gojira', artistId: artistIds.get('Gojira') }],
    };
    const result = await lineupService.expand(editorId, eventId, dto);
    expect(result.addedArtists).toEqual([
      { artistId: artistIds.get('Gojira'), name: 'Gojira', position: 3 },
    ]);
    const repeated = await lineupService.expand(editorId, eventId, dto);
    expect(repeated).toEqual(result);
    const lineup = (await dataSource.query(
      'SELECT "name", "position", "tour_id" FROM "event_artists" WHERE "event_id" = $1 ORDER BY "position"',
      [eventId],
    )) as Array<{ name: string; position: number; tour_id: string | null }>;
    expect(lineup.map(({ name, position }) => [name, position])).toEqual([
      ['Septicflesh', 1],
      ['Kvelertak', 2],
      ['Gojira', 3],
    ]);
    expect(lineup[2].tour_id).toBeNull();
    const current = (await dataSource.query(
      `SELECT "name", "type", "start_date", "end_date", "venue_id", "tour_id", "price", "other_info"
       FROM "events" WHERE "id" = $1`,
      [eventId],
    )) as Array<Record<string, unknown>>;
    expect(current).toEqual(original);
  });

  it('serializes concurrent lineup expansions and allocates distinct positions without duplicates or deadlocks', async () => {
    const eventId = tourConcertIds[0];
    const sourceRowId = randomUUID();
    const sourceRow: ImportLineupSourceDto = {
      rowId: sourceRowId,
      type: 'concert',
      name: null,
      lineup: [
        { name: 'Septicflesh', artistId: artistIds.get('Septicflesh') },
        { name: 'Kreator', artistId: artistIds.get('Kreator') },
        { name: 'Emperor', artistId: artistIds.get('Emperor') },
      ],
      startDate: '2027-10-20',
      city: 'Madrid',
      province: 'Madrid',
      countryId,
      administrativeRegionId: regionId,
    };
    const expansion = (name: 'Kreator' | 'Emperor') => {
      const rowId = randomUUID();
      return lineupService.expand(editorId, eventId, {
        batchId: randomUUID(),
        rowId,
        sourceRow: { ...sourceRow, rowId },
        artists: [{ name, artistId: artistIds.get(name) }],
      });
    };
    const beforeDeadlocks = await readDeadlocks(dataSource);
    const lockSamples: number[] = [];
    let monitor = true;
    const observeLocks = async () => {
      while (monitor) {
        const count = await dataSource.query(
          `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'
             AND pid <> pg_backend_pid()`,
        );
        lockSamples.push(Number(count[0]?.count ?? 0));
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    const startedAt = performance.now();
    const monitorPromise = observeLocks();
    const expanded = await Promise.all([
      expansion('Kreator'),
      expansion('Emperor'),
    ]);
    monitor = false;
    await monitorPromise;
    const elapsedMs = performance.now() - startedAt;
    const afterDeadlocks = await readDeadlocks(dataSource);
    expect(expanded.flatMap((result) => result.addedArtists)).toHaveLength(2);
    const positions = (await dataSource.query(
      'SELECT "name", "position" FROM "event_artists" WHERE "event_id" = $1 ORDER BY "position"',
      [eventId],
    )) as Array<{ name: string; position: number }>;
    expect(positions.map(({ position }) => position)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(positions.map(({ name }) => name)).size).toBe(5);
    expect(afterDeadlocks - beforeDeadlocks).toBe(0);
    console.log(
      `[CON-B04f concurrency] ${JSON.stringify({
        concurrentLineupRequests: 2,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        maxObservedLockWaiters: Math.max(0, ...lockSamples),
        deadlocks: afterDeadlocks - beforeDeadlocks,
        finalPositions: positions.map(({ position }) => position),
      })}`,
    );
  });

  it('serializes concurrent materialization of the same Artist, Venue and Tour', async () => {
    const tourName = 'Concurrent Import Tour 2031';
    const artistName = 'Concurrent Materialized Artist';
    const requests = ['2031-01-04', '2031-01-06'].map((startDate) => {
      const request = batch([
        row(randomUUID(), startDate, [{ name: artistName }], {
          type: 'tour',
          name: tourName,
          venue: 'Concurrent Import Hall',
          administrativeRegionId: regionId,
        }),
      ]);
      request.countryId = countryId;
      return request;
    });

    const results = await Promise.all(
      requests.map((request) => batchService.importBatch(editorId, request)),
    );
    const statuses = results.map((result) => result.results[0].status).sort();
    expect(statuses).toEqual(['conflict', 'created']);

    const entities = (await dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM "artist" WHERE "search_name_normalized" = $1) AS artists,
         (SELECT count(*)::int FROM "venues" WHERE "locality_id" = $2 AND "name_normalized" = $3 AND NOT "is_generic") AS venues,
         (SELECT count(*)::int FROM "tours" WHERE "normalized_name" = $4) AS tours,
         (SELECT count(*)::int FROM "events" WHERE "start_date" IN ('2031-01-04', '2031-01-06')) AS events`,
      [
        artistName.toLowerCase(),
        localityId,
        'concurrent import hall',
        'concurrent import tour 2031',
      ],
    )) as Array<{
      artists: number;
      venues: number;
      tours: number;
      events: number;
    }>;
    expect(entities[0]).toEqual({ artists: 1, venues: 1, tours: 1, events: 1 });
  });

  it('revalidates simultaneous incompatible imports under the locality lock', async () => {
    const requests = ['Concurrent Hall A', 'Concurrent Hall B'].map((venue) => {
      const request = batch([
        row(randomUUID(), '2050-02-15', [{ name: 'Septicflesh' }], {
          venue,
          administrativeRegionId: regionId,
        }),
      ]);
      request.countryId = countryId;
      return request;
    });
    const results = await Promise.all(
      requests.map((request) => batchService.importBatch(editorId, request)),
    );
    expect(results.map((result) => result.results[0].status).sort()).toEqual([
      'conflict',
      'created',
    ]);
    const persisted = (await dataSource.query(
      `SELECT count(*)::int AS count FROM "events" event
       JOIN "event_artists" lineup ON lineup."event_id" = event."id"
       WHERE event."start_date" = '2050-02-15' AND lineup."artist_id" = $1`,
      [artistIds.get('Septicflesh')],
    )) as Array<{ count: number }>;
    const venues = (await dataSource.query(
      `SELECT count(*)::int AS count FROM "venues"
       WHERE "locality_id" = $1 AND "name_normalized" IN ('concurrent hall a', 'concurrent hall b')`,
      [localityId],
    )) as Array<{ count: number }>;
    expect(persisted[0].count).toBe(1);
    expect(venues[0].count).toBe(1);
  });

  it('geocodes one new locality using only the Docker fixture and avoids geocoding registered localities', async () => {
    const before = (await fetch('http://127.0.0.1:55473/requests').then(
      (response) => response.json(),
    )) as { searchRequests: number };
    const newLocality = row(
      randomUUID(),
      '2028-08-05',
      [{ name: 'Docker City Noise' }],
      {
        city: 'Docker City',
        province: null,
        venue: 'Mock Hall',
      },
    );
    newLocality.administrativeRegionId = regionId;
    const request = batch([newLocality]);
    request.countryId = countryId;
    const result = await batchService.importBatch(editorId, request);
    expect(result.results[0].status).toBe('created');
    const after = (await fetch('http://127.0.0.1:55473/requests').then(
      (response) => response.json(),
    )) as { searchRequests: number };
    expect(after.searchRequests - before.searchRequests).toBe(1);
    const locality = (await dataSource.query(
      `SELECT "latitude", "longitude", "osm_type", "osm_id"
       FROM "localities" WHERE "name_normalized" = 'docker city'`,
    )) as Array<{
      latitude: number;
      longitude: number;
      osm_type: string;
      osm_id: string;
    }>;
    expect(locality).toEqual([
      {
        latitude: 40.4168,
        longitude: -3.7038,
        osm_type: 'relation',
        osm_id: expect.stringMatching(/^\d+$/u),
      },
    ]);
  });

  it('benchmarks 20, 50 and 100 row batches across reuse, shared Tours, conflicts and retries', async () => {
    const results: Array<Record<string, unknown>> = [];
    for (const size of [20, 50, 100]) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const localityFields = { administrativeRegionId: regionId };
        const reusedRows = Array.from({ length: size }, (_, index) => {
          const locality =
            existingBenchmarkLocalities[
              index % existingBenchmarkLocalities.length
            ];
          return row(
            randomUUID(),
            dateAt((size + repetition) * 400 + index),
            [{ name: 'Septicflesh' }],
            {
              ...localityFields,
              city: locality.city,
              province: locality.province,
              administrativeRegionId: locality.administrativeRegionId,
              venue: `Benchmark Hall ${locality.city}`,
            },
          );
        });
        const reused = batch(reusedRows);
        reused.countryId = countryId;
        const aRequestCountBefore = (await fetch(
          'http://127.0.0.1:55473/requests',
        ).then((response) => response.json())) as { searchRequests: number };
        logger.reset();
        let startedAt = performance.now();
        const created = await batchService.importBatch(editorId, reused);
        const elapsedMs = performance.now() - startedAt;
        expect(created.results.every((item) => item.status === 'created')).toBe(
          true,
        );
        const aRequestCountAfter = (await fetch(
          'http://127.0.0.1:55473/requests',
        ).then((response) => response.json())) as { searchRequests: number };
        expect(aRequestCountAfter.searchRequests).toBe(
          aRequestCountBefore.searchRequests,
        );
        const writeQueries = logger.queryCount;
        results.push({
          scenario: 'A-existing-locality-artist-venue',
          size,
          repetition,
          elapsedMs: Number(elapsedMs.toFixed(2)),
          msPerRow: Number((elapsedMs / size).toFixed(2)),
          sqlQueries: writeQueries,
          queryErrors: logger.queryErrors,
          geocoderRequests: 0,
          createdEvents: created.results.length,
        });

        logger.reset();
        startedAt = performance.now();
        const replayed = await batchService.importBatch(editorId, reused);
        const replayMs = performance.now() - startedAt;
        expect(replayed.results.every((item) => item.replayed === true)).toBe(
          true,
        );
        results.push({
          scenario: 'C-idempotent-retry',
          size,
          repetition,
          elapsedMs: Number(replayMs.toFixed(2)),
          msPerRow: Number((replayMs / size).toFixed(2)),
          sqlQueries: logger.queryCount,
          queryErrors: logger.queryErrors,
          replayedRows: replayed.results.length,
        });

        const sharedTourRows = Array.from({ length: size }, (_, index) =>
          row(
            randomUUID(),
            dateAt((size + repetition + 10) * 500 + index),
            [{ name: 'Septicflesh' }],
            {
              ...localityFields,
              type: 'tour',
              name: `Septicflesh Benchmark Tour ${size} ${repetition}`,
            },
          ),
        );
        const sharedTour = batch(sharedTourRows);
        sharedTour.countryId = countryId;
        logger.reset();
        startedAt = performance.now();
        const sharedTourResult = await batchService.importBatch(
          editorId,
          sharedTour,
        );
        const tourMs = performance.now() - startedAt;
        expect(
          sharedTourResult.results.every((item) => item.status === 'created'),
        ).toBe(true);
        const tourIds = sharedTourResult.results.flatMap((item) =>
          item.status === 'created' && item.tourId ? [item.tourId] : [],
        );
        expect(new Set(tourIds).size).toBe(1);
        results.push({
          scenario: 'B-shared-Tour-and-Artist',
          size,
          repetition,
          elapsedMs: Number(tourMs.toFixed(2)),
          msPerRow: Number((tourMs / size).toFixed(2)),
          sqlQueries: logger.queryCount,
          queryErrors: logger.queryErrors,
          createdEvents: sharedTourResult.results.length,
          toursCreated: 1,
        });

        const conflictDate = dateAt((size + repetition + 25) * 700);
        const conflictingRows = Array.from({ length: size }, () =>
          row(randomUUID(), conflictDate, [{ name: 'Septicflesh' }], {
            ...localityFields,
            type: 'concert',
          }),
        );
        const conflicting = batch(conflictingRows);
        conflicting.countryId = countryId;
        logger.reset();
        startedAt = performance.now();
        const conflicts = await batchService.importBatch(editorId, conflicting);
        const conflictMs = performance.now() - startedAt;
        expect(
          conflicts.results.every((item) => item.status === 'conflict'),
        ).toBe(true);
        results.push({
          scenario: 'C-intra-batch-conflicts',
          size,
          repetition,
          elapsedMs: Number(conflictMs.toFixed(2)),
          msPerRow: Number((conflictMs / size).toFixed(2)),
          sqlQueries: logger.queryCount,
          queryErrors: logger.queryErrors,
          conflicts: conflicts.results.length,
        });

        const city = `Docker City Batch ${size} ${repetition}`;
        const geocodedRows = Array.from({ length: size }, (_, index) =>
          row(
            randomUUID(),
            dateAt((size + repetition + 40) * 900 + index),
            [{ name: 'Septicflesh' }],
            {
              ...localityFields,
              city,
              province: null,
              venue: 'Fixture Hall',
            },
          ),
        );
        const geocodedBatch = batch(geocodedRows);
        geocodedBatch.countryId = countryId;
        const requestCountBefore = (await fetch(
          'http://127.0.0.1:55473/requests',
        ).then((response) => response.json())) as { searchRequests: number };
        logger.reset();
        startedAt = performance.now();
        const geocoded = await batchService.importBatch(
          editorId,
          geocodedBatch,
        );
        const geocodedMs = performance.now() - startedAt;
        expect(
          geocoded.results.every((item) => item.status === 'created'),
        ).toBe(true);
        const requestCountAfter = (await fetch(
          'http://127.0.0.1:55473/requests',
        ).then((response) => response.json())) as { searchRequests: number };
        expect(
          requestCountAfter.searchRequests - requestCountBefore.searchRequests,
        ).toBe(1);
        results.push({
          scenario: 'D-new-locality-geocoder-fixture',
          size,
          repetition,
          elapsedMs: Number(geocodedMs.toFixed(2)),
          msPerRow: Number((geocodedMs / size).toFixed(2)),
          sqlQueries: logger.queryCount,
          queryErrors: logger.queryErrors,
          createdEvents: geocoded.results.length,
          geocoderRequests:
            requestCountAfter.searchRequests -
            requestCountBefore.searchRequests,
        });
      }
    }
    console.log(`[CON-B04f benchmark] ${JSON.stringify(results)}`);
  }, 300_000);
});

async function readDeadlocks(dataSource: DataSource): Promise<number> {
  const rows = (await dataSource.query(
    'SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()',
  )) as Array<{ deadlocks: number | string }>;
  return Number(rows[0]?.deadlocks ?? 0);
}
