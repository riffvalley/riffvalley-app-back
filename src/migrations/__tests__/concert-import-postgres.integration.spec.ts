import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CreateVenueCatalog1792070000000 } from '../1792070000000-CreateVenueCatalog';
import { CreateLocalityAliases1792080000000 } from '../1792080000000-CreateLocalityAliases';
import { CreateEventDomain1792090000000 } from '../1792090000000-CreateEventDomain';
import { CreateTours1792100000000 } from '../1792100000000-CreateTours';
import { AddTourToEventArtists1792110000000 } from '../1792110000000-AddTourToEventArtists';
import { PrepareTourNamesAndImportReceipts1792120000000 } from '../1792120000000-PrepareTourNamesAndImportReceipts';
import { ScopeImportReceiptsByOperation1792130000000 } from '../1792130000000-ScopeImportReceiptsByOperation';

const enabled = process.env.CON_B04F_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

const expectedMigrations = [
  'CreateVenueCatalog1792070000000',
  'CreateLocalityAliases1792080000000',
  'CreateEventDomain1792090000000',
  'CreateTours1792100000000',
  'AddTourToEventArtists1792110000000',
  'PrepareTourNamesAndImportReceipts1792120000000',
  'ScopeImportReceiptsByOperation1792130000000',
];

function assertDockerTarget(): void {
  if (
    process.env.STAGE !== 'dev' ||
    process.env.DB_HOST !== '127.0.0.1' ||
    process.env.DB_PORT !== '55472' ||
    process.env.CON_B04F_DB_NAME !== 'con_b04f_events' ||
    process.env.DB_NAME !== process.env.CON_B04F_DB_NAME ||
    process.env.DB_USERNAME !== 'con_b04f_runner' ||
    process.env.DATABASE_URL
  ) {
    throw new Error(
      'CON-B04f migration integration requires its dedicated Docker PostgreSQL target.',
    );
  }
}

integrationSuite('Concert import migrations PostgreSQL integration', () => {
  let dataSource: DataSource;
  let localityId: string;
  let countryId: string;
  let regionId: string;
  let physicalVenueId: string;
  let genericVenueId: string;
  let tourId: string;
  let concertId: string;
  let secondConcertId: string;
  let thirdConcertId: string;
  let festivalId: string;

  beforeAll(async () => {
    assertDockerTarget();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      synchronize: false,
      migrationsRun: false,
      migrations: [
        CreateVenueCatalog1792070000000,
        CreateLocalityAliases1792080000000,
        CreateEventDomain1792090000000,
        CreateTours1792100000000,
        AddTourToEventArtists1792110000000,
        PrepareTourNamesAndImportReceipts1792120000000,
        ScopeImportReceiptsByOperation1792130000000,
      ],
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

    const tableCount = (await dataSource.query(
      `SELECT count(*)::int AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )) as Array<{ count: number }>;
    expect(tableCount[0].count).toBe(0);

    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.query(`
      CREATE TABLE "country" (
        "id" uuid PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "isoCode" varchar(50)
      )
    `);
    await dataSource.query(`
      CREATE TABLE "artist" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "name_normalized" text NOT NULL,
        "search_name_normalized" text,
        "description" text,
        "image" text,
        "countryId" uuid REFERENCES "country"("id") ON DELETE SET NULL,
        "needsReview" boolean NOT NULL DEFAULT true,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY)');

    const executed = await dataSource.runMigrations({ transaction: 'all' });
    expect(executed.map(({ name }) => name)).toEqual(expectedMigrations);
    localityId = randomUUID();
    countryId = randomUUID();
    regionId = randomUUID();
    physicalVenueId = randomUUID();
    genericVenueId = randomUUID();
    tourId = randomUUID();
    concertId = randomUUID();
    secondConcertId = randomUUID();
    thirdConcertId = randomUUID();
    festivalId = randomUUID();
    const artistIds = [randomUUID(), randomUUID(), randomUUID()];
    await dataSource.query(
      'INSERT INTO "country" ("id", "name", "isoCode") VALUES ($1, $2, $3)',
      [countryId, 'Spain', 'ES'],
    );
    await dataSource.query(
      `INSERT INTO "administrative_regions" ("id", "name", "name_normalized", "code", "country_id")
       VALUES ($1, 'Community of Madrid', 'community of madrid', 'MD', $2)`,
      [regionId, countryId],
    );
    await dataSource.query(
      `INSERT INTO "localities" ("id", "name", "name_normalized", "province", "province_normalized", "administrative_region_id")
       VALUES ($1, 'Madrid', 'madrid', 'Madrid', 'madrid', $2)`,
      [localityId, regionId],
    );
    await dataSource.query(
      `INSERT INTO "venues" ("id", "name", "name_normalized", "type", "locality_id")
       VALUES ($1, 'La Riviera', 'la riviera', 'concert_hall', $2)`,
      [physicalVenueId, localityId],
    );
    await dataSource.query(
      `INSERT INTO "venues" ("id", "name", "name_normalized", "type", "locality_id", "is_generic")
       VALUES ($1, 'Madrid', 'madrid', 'other', $2, true)`,
      [genericVenueId, localityId],
    );
    await dataSource.query(
      `INSERT INTO "artist" ("id", "name", "name_normalized", "search_name_normalized")
       VALUES ($1, 'Migration Artist One', 'migration artist one', 'migration artist one'),
              ($2, 'Migration Artist Two', 'migration artist two', 'migration artist two'),
              ($3, 'Migration Artist Three', 'migration artist three', 'migration artist three')`,
      artistIds,
    );
    await dataSource.query(
      `INSERT INTO "tours" ("id", "name", "normalized_name")
       VALUES ($1, 'Migration Tour', 'migration tour')`,
      [tourId],
    );
    await dataSource.query(
      `INSERT INTO "events" ("id", "type", "start_date", "venue_id", "tour_id")
       VALUES ($1, 'concert', '2027-05-15', $2, $3),
              ($4, 'concert', '2027-05-17', $2, $3),
              ($5, 'concert', '2027-05-19', $2, $3),
              ($6, 'festival', '2027-06-01', $7, NULL)`,
      [
        concertId,
        physicalVenueId,
        tourId,
        secondConcertId,
        thirdConcertId,
        festivalId,
        genericVenueId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position")
       VALUES ($1, $2, 'Migration Artist One', 1), ($3, $4, 'Migration Artist Two', 1),
              ($5, $6, 'Migration Artist Three', 1)`,
      [
        concertId,
        artistIds[0],
        secondConcertId,
        artistIds[1],
        thirdConcertId,
        artistIds[2],
      ],
    );
    await dataSource.query(
      `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position", "tour_id")
       VALUES ($1, $2, 'Migration Festival Artist', 1, $3)`,
      [festivalId, artistIds[0], tourId],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('executes the real event and import migrations and creates the required constraints, indexes and triggers', async () => {
    const indexes = (await dataSource.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND indexname IN (
         'UQ_venues_locality_name_normalized', 'UQ_venues_generic_locality',
         'UQ_tours_normalized_name', 'UQ_event_artists_event_position',
         'IDX_event_artists_tour_event_position',
         'UQ_catalog_import_row_receipts_identity'
       ) ORDER BY indexname`,
    )) as Array<{ indexname: string }>;
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'IDX_event_artists_tour_event_position',
      'UQ_catalog_import_row_receipts_identity',
      'UQ_event_artists_event_position',
      'UQ_tours_normalized_name',
      'UQ_venues_generic_locality',
      'UQ_venues_locality_name_normalized',
    ]);
    const triggers = (await dataSource.query(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
       AND tgname IN ('TRG_event_artists_tour_festival', 'TRG_events_type_festival_tour_associations')
       ORDER BY tgname`,
    )) as Array<{ tgname: string }>;
    expect(triggers.map(({ tgname }) => tgname)).toEqual([
      'TRG_event_artists_tour_festival',
      'TRG_events_type_festival_tour_associations',
    ]);
    const sharedTourEvents = (await dataSource.query(
      'SELECT count(*)::int AS count FROM "events" WHERE "tour_id" = $1',
      [tourId],
    )) as Array<{ count: number }>;
    expect(sharedTourEvents[0].count).toBe(3);
    const tourPerformances = (await dataSource.query(
      'SELECT count(*)::int AS count FROM "event_artists" WHERE "tour_id" = $1',
      [tourId],
    )) as Array<{ count: number }>;
    expect(tourPerformances[0].count).toBe(1);
  });

  it('enforces venue, Tour, EventArtist, foreign-key and festival-tour integrity', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "venues" ("name", "name_normalized", "type", "locality_id", "is_generic")
         VALUES ('Another generic', 'another generic', 'other', $1, true)`,
        [localityId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      dataSource.query(
        `INSERT INTO "venues" ("name", "name_normalized", "type", "locality_id", "is_generic", "latitude", "longitude")
         VALUES ('Bad generic', 'bad generic', 'other', $1, true, 40.4, -3.7)`,
        [localityId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      dataSource.query(
        `INSERT INTO "tours" ("name", "normalized_name")
         VALUES ('MIGRATION TOUR', 'migration tour')`,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      dataSource.query(
        `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position")
         VALUES ($1, $2, 'Unknown artist', 2)`,
        [festivalId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const concertArtistId = (await dataSource.query(
      'SELECT "artist_id" FROM "event_artists" WHERE "event_id" = $1 LIMIT 1',
      [concertId],
    )) as Array<{ artist_id: string }>;
    await expect(
      dataSource.query(
        `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position", "tour_id")
         VALUES ($1, $2, 'Invalid concert tour', 2, $3)`,
        [concertId, concertArtistId[0].artist_id, tourId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      dataSource.query(
        `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position")
         VALUES ($1, $2, 'Duplicate position', 1)`,
        [concertId, concertArtistId[0].artist_id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      dataSource.query(
        'UPDATE "events" SET "type" = \'concert\' WHERE "id" = $1',
        [festivalId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      dataSource.query('DELETE FROM "tours" WHERE "id" = $1', [tourId]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rolls back event and lineup writes together', async () => {
    const eventId = randomUUID();
    const artistId = randomUUID();
    await expect(
      dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO "artist" ("id", "name", "name_normalized")
           VALUES ($1, 'Transient Artist', 'transient artist')`,
          [artistId],
        );
        await manager.query(
          `INSERT INTO "events" ("id", "type", "start_date", "venue_id")
           VALUES ($1, 'concert', '2027-07-01', $2)`,
          [eventId, physicalVenueId],
        );
        await manager.query(
          `INSERT INTO "event_artists" ("event_id", "artist_id", "name", "position")
           VALUES ($1, $2, 'Transient Artist', 1)`,
          [eventId, artistId],
        );
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    const remaining = (await dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM "events" WHERE "id" = $1) AS events,
         (SELECT count(*)::int FROM "artist" WHERE "id" = $2) AS artists,
         (SELECT count(*)::int FROM "event_artists" WHERE "event_id" = $1) AS lineup`,
      [eventId, artistId],
    )) as Array<{ events: number; artists: number; lineup: number }>;
    expect(remaining[0]).toEqual({ events: 0, artists: 0, lineup: 0 });
  });
});
