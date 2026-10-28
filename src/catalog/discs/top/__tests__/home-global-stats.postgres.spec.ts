import { CURRENT_RATES_CTE } from '../loaders/home-global-stats';
import {
  HomePostgresClient,
  getHomePostgresValues,
  requireTopDiscsPostgresTestTarget,
  verifyTopDiscsPostgresTestIdentity,
} from './home-postgres-types';

const describePostgres =
  process.env.D31_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('TopDiscs global vote prior with PostgreSQL fixtures', () => {
  let client: HomePostgresClient | null = null;
  const getClient = (): HomePostgresClient => {
    if (!client) throw new Error('PostgreSQL client is not initialized');
    return client;
  };

  beforeAll(async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    requireTopDiscsPostgresTestTarget('D31_POSTGRES_TEST');

    const { Client } = await import('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await verifyTopDiscsPostgresTestIdentity(client);
    await getClient().query(`
      CREATE TEMP TABLE disc (id integer PRIMARY KEY, "releaseDate" date);
      CREATE TEMP TABLE rate (
        id integer PRIMARY KEY,
        "discId" integer,
        "userId" integer,
        rate numeric,
        cover numeric,
        "createdAt" timestamp NOT NULL,
        "editedAt" timestamp
      );
    `);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await getClient().query('TRUNCATE rate, disc');
    await getClient().query(`
      INSERT INTO disc (id, "releaseDate") VALUES
        (1, DATE '2020-01-01'),
        (2, DATE '2027-01-01');
      INSERT INTO rate (id, "discId", "userId", rate, "createdAt", "editedAt") VALUES
        (1, 1, 1, 8, TIMESTAMP '2024-01-01', TIMESTAMP '2024-01-01'),
        (2, 1, 1, 10, TIMESTAMP '2024-01-01', TIMESTAMP '2024-02-01'),
        (3, 1, 2, 0, TIMESTAMP '2024-01-01', NULL),
        (4, 1, 3, NULL, TIMESTAMP '2024-01-01', NULL),
        (5, 1, 4, 11, TIMESTAMP '2024-01-01', NULL),
        (6, 2, 5, 10, TIMESTAMP '2024-01-01', NULL),
        (7, 1, NULL, 10, TIMESTAMP '2024-01-01', NULL);
    `);
  });

  async function loadPrior(asOf = '2026-10-28') {
    const sql = `
      WITH ${CURRENT_RATES_CTE},
      global_prior AS (
        SELECT SUM(vr.rate) / NULLIF(COUNT(*), 0) AS "globalAvgRate"
        FROM valid_current_rates vr
        INNER JOIN disc prior_disc ON prior_disc.id = vr."discId"
        WHERE prior_disc."releaseDate" <= $1
      )
      SELECT "globalAvgRate" FROM global_prior;
    `;
    const result = await getClient().query(sql, getHomePostgresValues([asOf]));
    return result.rows[0].globalAvgRate;
  }

  it('deduplicates current votes, retains zero, excludes null/out-of-scale and future releases', async () => {
    expect(await loadPrior()).toBe('5.0000000000000000');
  });

  it('returns a NULL prior when no valid published votes exist', async () => {
    await getClient().query('DELETE FROM rate WHERE "discId" = 1');
    expect(await loadPrior()).toBeNull();
  });
});
