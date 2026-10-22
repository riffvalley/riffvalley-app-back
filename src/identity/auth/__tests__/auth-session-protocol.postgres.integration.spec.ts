import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { json } from 'express';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ActivityService } from '../../activity/activity.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { AUTH_SESSION_MODE } from '../dto/session-auth-contract.dto';
import { UserIdentity, UsersService } from '../../users/users.service';
import { ValidRoles } from '../../authorization/interfaces/valid-roles';
import { AuthRefreshToken } from '../../sessions/entities/auth-refresh-token.entity';
import { AuthSession } from '../../sessions/entities/auth-session.entity';
import {
  SESSIONS_PERSISTENCE,
  TypeOrmSessionsPersistence,
} from '../../sessions/persistence/sessions.persistence';
import { SessionsService } from '../../sessions/sessions.service';
import { AUTH_HTTP_CORS_OPTIONS } from '../session-http/session-http-cors';
import {
  AUTH_RATE_LIMIT_INCREMENT_SQL,
  AuthRateLimitService,
} from '../rate-limiting/auth-rate-limit.service';
import { CreateAuthRateLimitWindows1791980000000 } from '../../../migrations/1791980000000-CreateAuthRateLimitWindows';

const enabled = process.env.AUTH_SESSION_HTTP_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;
const appOrigin = 'https://app.riffvalley.es';
const wikiOrigin = 'https://wiki.riffvalley.es';
const edgeSecret = Buffer.alloc(32, 19).toString('base64url');
const jwtSecret = 'isolated-http-session-integration-secret';
const loginPassword = 'IntegrationPassword1';

type CookieJar = {
  refreshCookie: string;
  csrfToken: string;
  logoutCsrfToken: string;
  expiresAt: string;
};

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('bc_id_6b2_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'HTTP/PostgreSQL integration requires a loopback-only disposable database named bc_id_6b2_* and explicit credentials.',
    );
  }
}

function cookiePair(
  header: string | string[] | undefined,
  name: string,
): string {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = values.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Expected Set-Cookie for ${name}`);
  return cookie.split(';', 1)[0];
}

function responseString(value: unknown, key: string): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !(key in value) ||
    typeof value[key as keyof typeof value] !== 'string'
  ) {
    throw new Error(`Expected string response field ${key}`);
  }
  return value[key as keyof typeof value] as string;
}

integrationSuite(
  'renewable auth HTTP with PostgreSQL Sessions persistence',
  () => {
    let dataSource: DataSource;
    let app: INestApplication;
    let jwtService: JwtService;
    let userId: string;
    let passwordHash: string;
    let fakeUser: User;
    let usersService: jest.Mocked<
      Pick<
        UsersService,
        | 'findCredentialsByUsername'
        | 'findIdentityById'
        | 'recordLogin'
        | 'findById'
        | 'findSessionProfileById'
      >
    >;

    beforeAll(async () => {
      assertIsolatedTarget();
      dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        synchronize: false,
        migrationsRun: false,
        entities: ['src/**/*.entity.ts'],
      });
      await dataSource.initialize();

      const existingTables = (await dataSource.query(`
      SELECT count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `)) as Array<{ count: number }>;
      if (existingTables[0]?.count !== 0) {
        throw new Error(
          'The disposable HTTP integration database must start empty.',
        );
      }

      await dataSource.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY,
        "username" text NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "role" text NOT NULL,
        "image" text,
        "dashboardConfig" jsonb,
        "mobileDashboardConfig" jsonb,
        "dashboardButtonsEnabled" boolean NOT NULL DEFAULT false
      )
    `);
      const rateLimitMigration = new CreateAuthRateLimitWindows1791980000000();
      await rateLimitMigration.up(dataSource.createQueryRunner());
      await dataSource.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "client_type" text NOT NULL CHECK ("client_type" IN ('app', 'wiki')),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "last_activity_at" timestamptz NOT NULL DEFAULT now(),
        CHECK ("expires_at" > "created_at")
      )
    `);
      await dataSource.query(`
      CREATE TABLE "auth_refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL REFERENCES "auth_sessions"("id") ON DELETE CASCADE,
        "token_hash" bytea NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "consumed_at" timestamptz,
        "operation_key_hash" bytea,
        "replaced_by_id" uuid UNIQUE REFERENCES "auth_refresh_tokens"("id") ON DELETE SET NULL
      )
    `);
      await dataSource.query(
        'CREATE INDEX "http_test_refresh_session_consumed" ON "auth_refresh_tokens" ("session_id", "consumed_at")',
      );
      await dataSource.query(
        'CREATE UNIQUE INDEX "http_test_one_active_refresh" ON "auth_refresh_tokens" ("session_id") WHERE "consumed_at" IS NULL',
      );

      userId = randomUUID();
      passwordHash = bcrypt.hashSync(loginPassword, 10);
      fakeUser = Object.assign(new User(), {
        id: userId,
        username: 'integration-user',
        email: 'integration-user@example.test',
        password: passwordHash,
        role: 'user',
        isActive: true,
        dashboardConfig: null,
        mobileDashboardConfig: [{ id: 'news', enabled: false }],
        dashboardButtonsEnabled: false,
      });
      await dataSource.query(
        `INSERT INTO "users"
           ("id", "username", "isActive", "role", "dashboardConfig",
            "mobileDashboardConfig", "dashboardButtonsEnabled")
         VALUES ($1, $2, true, $3, $4::jsonb, $5::jsonb, $6)`,
        [
          userId,
          'integration-user',
          ValidRoles.user,
          null,
          JSON.stringify([{ id: 'news', enabled: false }]),
          false,
        ],
      );
      const sessionUsersService = new UsersService(
        dataSource.getRepository(User),
      );
      usersService = {
        findCredentialsByUsername: jest.fn<Promise<User | null>, [string]>(
          async (username: string) =>
            username.toLocaleLowerCase('en-US') === 'integration-user'
              ? fakeUser
              : null,
        ),
        findIdentityById: jest.fn(
          async (id: string): Promise<UserIdentity | null> => ({
            id,
            role: ValidRoles.user,
            isActive: true,
          }),
        ),
        recordLogin: jest.fn<Promise<void>, [string]>(async () => undefined),
        findById: jest.fn<Promise<User | null>, [string]>(async () => fakeUser),
        findSessionProfileById: jest.fn((id: string) =>
          sessionUsersService.findSessionProfileById(id),
        ),
      };

      const configService = new ConfigService({
        AUTH_SESSION_MODE_ENABLED: 'true',
        AUTH_SESSION_APP_ORIGIN: appOrigin,
        AUTH_SESSION_WIKI_ORIGIN: wikiOrigin,
        AUTH_SESSION_EDGE_SECRET: edgeSecret,
        JWT_SECRET: jwtSecret,
      });
      const moduleRef = await Test.createTestingModule({
        imports: [
          JwtModule.register({
            secret: jwtSecret,
            signOptions: { expiresIn: '8h' },
          }),
        ],
        controllers: [AuthController],
        providers: [
          AuthService,
          SessionsService,
          TypeOrmSessionsPersistence,
          { provide: DataSource, useValue: dataSource },
          {
            provide: SESSIONS_PERSISTENCE,
            useExisting: TypeOrmSessionsPersistence,
          },
          { provide: UsersService, useValue: usersService },
          {
            provide: ActivityService,
            useValue: {},
          },
          { provide: ConfigService, useValue: configService },
          AuthRateLimitService,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.use(json());
      app.setGlobalPrefix('api');
      app.enableCors(AUTH_HTTP_CORS_OPTIONS);
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      jwtService = moduleRef.get(JwtService);
    }, 30000);

    afterAll(async () => {
      if (app) await app.close();
      if (dataSource?.isInitialized) await dataSource.destroy();
    });

    beforeEach(async () => {
      userId = randomUUID();
      fakeUser.id = userId;
      await dataSource.query(
        'TRUNCATE TABLE "auth_rate_limit_windows", "auth_refresh_tokens", "auth_sessions", "users" CASCADE',
      );
      await dataSource.query(
        `INSERT INTO "users"
           ("id", "username", "isActive", "role", "dashboardConfig",
            "mobileDashboardConfig", "dashboardButtonsEnabled")
         VALUES ($1, 'integration-user', true, $2, NULL, $3::jsonb, false)`,
        [
          userId,
          ValidRoles.user,
          JSON.stringify([{ id: 'news', enabled: false }]),
        ],
      );
    });

    async function bootstrap(
      origin: string,
    ): Promise<{ csrfToken: string; nonceCookie: string }> {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Origin', origin)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site');
      expect(response.status).toBe(200);
      return {
        csrfToken: responseString(response.body, 'csrfToken'),
        nonceCookie: cookiePair(
          response.headers['set-cookie'],
          '__Secure-rv_login_csrf_nonce',
        ),
      };
    }

    async function login(origin: string): Promise<CookieJar> {
      const csrf = await bootstrap(origin);
      const clientType = origin === appOrigin ? 'app' : 'wiki';
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .set('X-Auth-Session-Mode', AUTH_SESSION_MODE)
        .set('X-CSRF-Token', csrf.csrfToken)
        .set('Cookie', csrf.nonceCookie)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site')
        .send({ username: 'integration-user', password: loginPassword });
      expect(response.status).toBe(200);
      const refreshCookie = cookiePair(
        response.headers['set-cookie'],
        `__Secure-rv_${clientType}_refresh`,
      );
      const decoded = jwtService.decode(responseString(response.body, 'token'));
      expect(typeof decoded).toBe('object');
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('iat' in decoded) ||
        !('exp' in decoded) ||
        typeof decoded.iat !== 'number' ||
        typeof decoded.exp !== 'number'
      ) {
        throw new Error('Access JWT did not contain numeric iat/exp claims.');
      }
      expect(decoded.exp - decoded.iat).toBe(15 * 60);
      expect(JSON.stringify(response.body)).not.toContain(
        refreshCookie.slice(refreshCookie.indexOf('=') + 1),
      );
      expect(response.headers['access-control-expose-headers']).toBeUndefined();
      const cookieHeader = response.headers['set-cookie'];
      const setCookie = Array.isArray(cookieHeader)
        ? cookieHeader
        : cookieHeader
          ? [cookieHeader]
          : [];
      const refreshHeader = setCookie.find((value) =>
        value.startsWith(`__Secure-rv_${clientType}_refresh=`),
      );
      expect(refreshHeader).toContain('HttpOnly');
      expect(refreshHeader).toContain('Secure');
      expect(refreshHeader).toContain('SameSite=Lax');
      expect(refreshHeader).toContain('Path=/api/auth');
      const expiresAt = new Date(
        refreshHeader!.match(/Expires=([^;]+)/)?.[1] ?? '',
      ).toISOString();
      expect(Date.parse(expiresAt)).toBeGreaterThan(
        Date.now() + 29 * 24 * 60 * 60 * 1000,
      );
      return {
        refreshCookie,
        csrfToken: responseString(response.body, 'csrfToken'),
        logoutCsrfToken: responseString(response.body, 'logoutCsrfToken'),
        expiresAt,
      };
    }

    async function attemptLogin(
      origin: string,
      username: string,
      password: string,
    ) {
      const csrf = await bootstrap(origin);
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .set('X-Auth-Session-Mode', AUTH_SESSION_MODE)
        .set('X-CSRF-Token', csrf.csrfToken)
        .set('Cookie', csrf.nonceCookie)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site')
        .send({ username, password });
    }

    async function refresh(
      origin: string,
      jar: CookieJar,
      operationId = randomUUID(),
    ) {
      return request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .set('X-Auth-Session-Mode', 'refresh-v1')
        .set('X-Refresh-Operation', operationId)
        .set('X-CSRF-Token', jar.csrfToken)
        .set('Cookie', jar.refreshCookie)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site')
        .send({});
    }

    async function logout(origin: string, jar: CookieJar) {
      return request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .set('X-CSRF-Token', jar.logoutCsrfToken)
        .set('Cookie', jar.refreshCookie)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site')
        .send({});
    }

    it('completes bootstrap, renewable login, rotation and idempotent logout over HTTP', async () => {
      const first = await login(appOrigin);
      const rotated = await refresh(appOrigin, first);
      expect(rotated.status).toBe(200);
      expect(rotated.body).toEqual({
        user: expect.objectContaining({
          id: userId,
          username: 'integration-user',
          role: ValidRoles.user,
          dashboardConfig: null,
          mobileDashboardConfig: [{ id: 'news', enabled: false }],
          dashboardButtonsEnabled: false,
        }),
        token: expect.any(String),
        csrfToken: expect.any(String),
        logoutCsrfToken: expect.any(String),
        expiresAt: expect.any(String),
      });
      const absoluteExpiry = Date.parse(first.expiresAt);
      const jsonExpiry = Date.parse(responseString(rotated.body, 'expiresAt'));
      expect(jsonExpiry).toBeGreaterThanOrEqual(absoluteExpiry);
      expect(jsonExpiry).toBeLessThan(absoluteExpiry + 1000);
      const rotatedCookie = cookiePair(
        rotated.headers['set-cookie'],
        '__Secure-rv_app_refresh',
      );
      expect(JSON.stringify(rotated.body)).not.toContain(
        rotatedCookie.slice(rotatedCookie.indexOf('=') + 1),
      );
      const rotatedExpiry = new Date(
        rotated.headers['set-cookie'][0].match(/Expires=([^;]+)/)?.[1] ?? '',
      ).toISOString();
      expect(rotatedExpiry).toBe(first.expiresAt);

      const nextJar: CookieJar = {
        refreshCookie: rotatedCookie,
        csrfToken: responseString(rotated.body, 'csrfToken'),
        logoutCsrfToken: responseString(rotated.body, 'logoutCsrfToken'),
        expiresAt: first.expiresAt,
      };
      const loggedOut = await logout(appOrigin, nextJar);
      expect(loggedOut.status).toBe(204);
      expect(loggedOut.text).toBe('');
      const clearedCookie = loggedOut.headers['set-cookie']?.[0] as string;
      expect(clearedCookie).toMatch(/^__Secure-rv_app_refresh=/);
      expect(clearedCookie).toContain('Path=/api/auth');
      expect(clearedCookie).toContain('HttpOnly');
      expect(clearedCookie).toContain('Secure');
      expect(
        new Date(clearedCookie.match(/Expires=([^;]+)/)?.[1] ?? '').getTime(),
      ).toBeLessThan(Date.now());
      expect((await logout(appOrigin, nextJar)).status).toBe(204);
      expect((await refresh(appOrigin, nextJar)).status).toBe(401);
    });

    it('enforces the HTTP bootstrap window, returns Retry-After, and resets after expiry', async () => {
      const statuses: number[] = [];
      let limitedStatus = 0;
      let retryAfter: string | undefined;
      let cacheControl: string | undefined;
      let responseBody = '';
      for (let attempt = 0; attempt < 31; attempt += 1) {
        const response = await request(app.getHttpServer())
          .get('/api/auth/csrf')
          .set('Origin', appOrigin)
          .set('X-RV-Session-Edge', edgeSecret)
          .set('Sec-Fetch-Site', 'same-site');
        statuses.push(response.status);
        if (attempt === 30) {
          limitedStatus = response.status;
          retryAfter = response.headers['retry-after'];
          cacheControl = response.headers['cache-control'];
          responseBody = JSON.stringify(response.body);
        }
      }

      expect(statuses.filter((status) => status === 200)).toHaveLength(30);
      expect(limitedStatus).toBe(429);
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(cacheControl).toBe('no-store');
      expect(responseBody).not.toContain('refresh');

      const isolatedWikiWindow = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Origin', wikiOrigin)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site');
      expect(isolatedWikiWindow.status).toBe(200);

      await dataSource.query(
        `UPDATE auth_rate_limit_windows
         SET window_started_at = window_started_at - interval '1 day',
             expires_at = expires_at - interval '1 day'
         WHERE scope = 'csrf_bootstrap_ip_app'`,
      );
      const reset = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Origin', appOrigin)
        .set('X-RV-Session-Edge', edgeSecret)
        .set('Sec-Fetch-Site', 'same-site');
      expect(reset.status).toBe(200);

      const persisted = (await dataSource.query(
        `SELECT attempt_count FROM auth_rate_limit_windows
         WHERE scope = 'csrf_bootstrap_ip_app'
         ORDER BY window_started_at`,
      )) as Array<{ attempt_count: number }>;
      expect(persisted).toHaveLength(2);
      expect(persisted[0]?.attempt_count).toBe(31);
      expect(persisted[1]?.attempt_count).toBe(1);
    });

    it('removes expired rate-limit buckets in the bounded opportunistic cleanup batch', async () => {
      const originalNow = Date.now;
      const now = originalNow();
      const expiredHash = Buffer.alloc(32, 4);
      await dataSource.query(
        `INSERT INTO auth_rate_limit_windows
           (scope, subject_hash, window_started_at, attempt_count, expires_at)
         VALUES ('expired_cleanup_probe', $1, $2, 1, $3)`,
        [expiredHash, new Date(now - 120_000), new Date(now - 60_000)],
      );
      jest.spyOn(Date, 'now').mockImplementation(() => now + 120_000);

      try {
        await app.get(AuthRateLimitService).consume([
          {
            scope: 'cleanup_trigger',
            subject: 'trigger',
            limit: 10,
            windowSeconds: 60,
          },
        ]);

        let remainingRows = 1;
        for (let attempt = 0; attempt < 20 && remainingRows > 0; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          const rows = (await dataSource.query(
            `SELECT count(*)::int AS count FROM auth_rate_limit_windows
             WHERE scope = 'expired_cleanup_probe'`,
          )) as Array<{ count: number }>;
          remainingRows = rows[0]?.count ?? 0;
        }

        expect(remainingRows).toBe(0);
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('keeps one shared limit under concurrent PostgreSQL increments', async () => {
      const rateLimiter = app.get(AuthRateLimitService);
      const results = await Promise.all(
        Array.from({ length: 40 }, () =>
          rateLimiter.consume([
            {
              scope: 'concurrency_probe',
              subject: 'shared-test-subject',
              limit: 30,
              windowSeconds: 60,
            },
          ]),
        ),
      );

      expect(results.filter((retryAfter) => retryAfter === null)).toHaveLength(
        30,
      );
      expect(results.filter((retryAfter) => retryAfter !== null)).toHaveLength(
        10,
      );
      const persisted = (await dataSource.query(
        `SELECT attempt_count FROM auth_rate_limit_windows
         WHERE scope = 'concurrency_probe'`,
      )) as Array<{ attempt_count: number }>;
      expect(persisted[0]?.attempt_count).toBe(40);
    });

    it('measures bounded local CPU, pool, transaction and table usage under distributed and hot-key writes', async () => {
      const rateLimiter = app.get(AuthRateLimitService);
      const explainedQuery = (await dataSource.query(
        `EXPLAIN (ANALYZE, BUFFERS) ${AUTH_RATE_LIMIT_INCREMENT_SQL}`,
        [['capacity_explain'], [Buffer.alloc(32, 8)], [2], [60], 2],
      )) as Array<{ 'QUERY PLAN': string }>;
      const queryPlan = explainedQuery
        .map((row) => row['QUERY PLAN'])
        .join('\n');
      const databaseQueryMs = Number(
        queryPlan.match(/Execution Time: ([0-9.]+) ms/)?.[1] ?? NaN,
      );
      const sharedBufferHits = Number(
        queryPlan.match(/Shared Hit Blocks: ([0-9]+)/)?.[1] ?? 0,
      );

      type PoolSnapshot = {
        connections: number;
        activeQueries: number;
        activeTransactions: number;
        maxTransactionAgeMs: number;
      };
      type TableStats = {
        rows: number;
        tableBytes: string;
        indexBytes: string;
        totalBytes: string;
      };

      const readTableStats = async (): Promise<TableStats> => {
        const rows = (await dataSource.query(
          `SELECT
             (SELECT count(*)::int FROM auth_rate_limit_windows) AS rows,
             pg_table_size('auth_rate_limit_windows')::text AS "tableBytes",
             pg_indexes_size('auth_rate_limit_windows')::text AS "indexBytes",
             pg_total_relation_size('auth_rate_limit_windows')::text AS "totalBytes"`,
        )) as TableStats[];
        if (!rows[0])
          throw new Error('PostgreSQL table statistics unavailable');
        return rows[0];
      };

      const tableStatsBefore = await readTableStats();
      const cpuBefore = process.cpuUsage();
      const startedAt = process.hrtime.bigint();
      const uniqueDurations: number[] = [];
      const hotKeyDurations: number[] = [];
      const poolSnapshots: PoolSnapshot[] = [];
      let sampling = true;
      let samplingError: string | undefined;

      const poolSampler = (async () => {
        while (sampling) {
          try {
            const rows = (await dataSource.query(
              `SELECT
                 count(*)::int AS connections,
                 count(*) FILTER (WHERE state = 'active')::int AS "activeQueries",
                 count(*) FILTER (WHERE xact_start IS NOT NULL)::int AS "activeTransactions",
                 COALESCE(max(EXTRACT(EPOCH FROM (clock_timestamp() - xact_start)) * 1000), 0)::float8 AS "maxTransactionAgeMs"
               FROM pg_stat_activity
               WHERE datname = current_database() AND pid <> pg_backend_pid()`,
            )) as Array<PoolSnapshot>;
            const snapshot = rows[0];
            if (snapshot) {
              poolSnapshots.push({
                connections: snapshot.connections + 1,
                activeQueries: snapshot.activeQueries + 1,
                activeTransactions: snapshot.activeTransactions + 1,
                maxTransactionAgeMs: snapshot.maxTransactionAgeMs,
              });
            }
          } catch (error) {
            samplingError =
              error instanceof Error ? error.message : 'pool sampling failed';
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      })();

      const runWrites = async (
        count: number,
        scope: string,
        subjectAt: (index: number) => string,
        durations: number[],
      ): Promise<void> => {
        const results = await Promise.all(
          Array.from({ length: count }, async (_, index) => {
            const requestStartedAt = process.hrtime.bigint();
            const retryAfter = await rateLimiter.consume([
              {
                scope,
                subject: subjectAt(index),
                limit: count + 1,
                windowSeconds: 60,
              },
            ]);
            durations.push(
              Number(process.hrtime.bigint() - requestStartedAt) / 1e6,
            );
            return retryAfter;
          }),
        );
        expect(results.every((retryAfter) => retryAfter === null)).toBe(true);
      };

      try {
        await runWrites(
          300,
          'capacity_sample_ip',
          (index) => `192.0.2.${(index % 250) + 1}-${index}`,
          uniqueDurations,
        );
        await runWrites(
          300,
          'capacity_sample_hot',
          () => 'shared-hot-subject',
          hotKeyDurations,
        );
      } finally {
        sampling = false;
        await poolSampler;
      }

      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const cpu = process.cpuUsage(cpuBefore);
      const tableStatsAfter = await readTableStats();
      const persistedCounts = (await dataSource.query(
        `SELECT scope, count(*)::int AS rows, max(attempt_count)::int AS max_attempts
         FROM auth_rate_limit_windows
         WHERE scope IN ('capacity_sample_ip', 'capacity_sample_hot')
         GROUP BY scope`,
      )) as Array<{ scope: string; rows: number; max_attempts: number }>;
      const p95 = (durations: number[]): number => {
        const ordered = durations.sort((left, right) => left - right);
        const index = Math.ceil(ordered.length * 0.95) - 1;
        return Number((ordered[index] ?? 0).toFixed(2));
      };
      const maxObserved = (key: keyof PoolSnapshot): number =>
        Math.max(0, ...poolSnapshots.map((sample) => sample[key]));
      const sample = {
        requests: uniqueDurations.length + hotKeyDurations.length,
        uniqueSubjectRequests: uniqueDurations.length,
        hotKeyRequests: hotKeyDurations.length,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        uniqueSubjectP95Ms: p95(uniqueDurations),
        hotKeyP95Ms: p95(hotKeyDurations),
        postgresUpsertExecutionMs: Number(databaseQueryMs.toFixed(3)),
        postgresSharedBufferHits: sharedBufferHits,
        nodeCpuUserMs: Number((cpu.user / 1000).toFixed(2)),
        nodeCpuSystemMs: Number((cpu.system / 1000).toFixed(2)),
        maxPoolConnections: maxObserved('connections'),
        maxActiveQueries: maxObserved('activeQueries'),
        maxActiveTransactions: maxObserved('activeTransactions'),
        maxTransactionAgeMs: Number(
          maxObserved('maxTransactionAgeMs').toFixed(2),
        ),
        completedLimiterTransactions:
          uniqueDurations.length + hotKeyDurations.length,
        tableRowsBefore: Number(tableStatsBefore.rows),
        tableRowsAfter: Number(tableStatsAfter.rows),
        tableBytesBefore: Number(tableStatsBefore.tableBytes),
        tableBytesAfter: Number(tableStatsAfter.tableBytes),
        indexBytesBefore: Number(tableStatsBefore.indexBytes),
        indexBytesAfter: Number(tableStatsAfter.indexBytes),
        totalBytesBefore: Number(tableStatsBefore.totalBytes),
        totalBytesAfter: Number(tableStatsAfter.totalBytes),
        uniqueSubjectRows:
          persistedCounts.find((row) => row.scope === 'capacity_sample_ip')
            ?.rows ?? 0,
        hotKeyRows:
          persistedCounts.find((row) => row.scope === 'capacity_sample_hot')
            ?.rows ?? 0,
        hotKeyAttemptCount:
          persistedCounts.find((row) => row.scope === 'capacity_sample_hot')
            ?.max_attempts ?? 0,
      };
      console.info(
        `[auth-rate-limit-capacity-sample] ${JSON.stringify(sample)}`,
      );

      expect(samplingError).toBeUndefined();
      expect(poolSnapshots.length).toBeGreaterThan(0);
      expect(sample.requests).toBe(600);
      expect(Number.isFinite(sample.postgresUpsertExecutionMs)).toBe(true);
      expect(sample.maxPoolConnections).toBeGreaterThan(1);
      expect(sample.maxActiveTransactions).toBeGreaterThan(1);
      expect(sample.completedLimiterTransactions).toBe(600);
      expect(sample.uniqueSubjectRows).toBe(300);
      expect(sample.hotKeyRows).toBe(1);
      expect(sample.hotKeyAttemptCount).toBe(300);
      expect(sample.tableBytesAfter).toBeGreaterThanOrEqual(
        sample.tableBytesBefore,
      );
      expect(sample.indexBytesAfter).toBeGreaterThanOrEqual(
        sample.indexBytesBefore,
      );
    });

    it('keeps invalid-account errors indistinguishable and limits normalized accounts', async () => {
      const wrongPassword = await attemptLogin(
        appOrigin,
        'integration-user',
        'WrongPassword1',
      );
      const absentAccount = await attemptLogin(
        appOrigin,
        'absent-account',
        'WrongPassword1',
      );

      expect(wrongPassword.status).toBe(401);
      expect(absentAccount.status).toBe(401);
      expect(absentAccount.body).toEqual(wrongPassword.body);

      const accountAttempts = await Promise.all(
        Array.from({ length: 4 }, () =>
          attemptLogin(appOrigin, 'Integration-User', 'WrongPassword1'),
        ),
      );
      expect(accountAttempts.every((response) => response.status === 401)).toBe(
        true,
      );
      const limited = await attemptLogin(
        appOrigin,
        'INTEGRATION-USER',
        'WrongPassword1',
      );
      expect(limited.status).toBe(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(limited.body).toEqual({
        statusCode: 429,
        message: 'Authentication request is not available',
      });

      const persisted = (await dataSource.query(
        `SELECT attempt_count FROM auth_rate_limit_windows
         WHERE scope = 'login_account' ORDER BY attempt_count`,
      )) as Array<{ attempt_count: number }>;
      expect(persisted.map((row) => row.attempt_count)).toEqual([1, 6]);
    });

    it('keeps App and Wiki sessions independent and rejects a cross-client cookie', async () => {
      const appJar = await login(appOrigin);
      const wikiJar = await login(wikiOrigin);
      const appSessionCount = await dataSource
        .getRepository(AuthSession)
        .count({
          where: { user: { id: userId }, clientType: 'app' },
        });
      const wikiSessionCount = await dataSource
        .getRepository(AuthSession)
        .count({
          where: { user: { id: userId }, clientType: 'wiki' },
        });
      expect(appSessionCount).toBe(1);
      expect(wikiSessionCount).toBe(1);

      expect((await refresh(wikiOrigin, appJar)).status).not.toBe(200);
      const wikiRefresh = await refresh(wikiOrigin, wikiJar);
      expect(wikiRefresh.status).toBe(200);
      expect(
        await dataSource.getRepository(AuthRefreshToken).count(),
      ).toBeGreaterThan(2);
    });

    it('preflights credentialed HTTP and reports concurrent reuse without leaking credentials', async () => {
      const jar = await login(appOrigin);
      const preflight = await request(app.getHttpServer())
        .options('/api/auth/refresh')
        .set('Origin', appOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set(
          'Access-Control-Request-Headers',
          'content-type,x-auth-session-mode,x-csrf-token,x-refresh-operation',
        );
      expect(preflight.status).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(appOrigin);
      expect(preflight.headers['access-control-allow-credentials']).toBe(
        'true',
      );
      expect(preflight.headers.vary).toContain('Origin');

      const responses = await Promise.all([
        refresh(appOrigin, jar, randomUUID()),
        refresh(appOrigin, jar, randomUUID()),
      ]);
      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([200, 401]);
      const failure = responses.find((response) => response.status === 401);
      expect(failure?.body).toEqual({
        statusCode: 401,
        message: 'Session is not available',
        error: 'Unauthorized',
      });
      expect(JSON.stringify(failure?.body)).not.toContain(jar.refreshCookie);
      expect(JSON.stringify(failure?.headers)).not.toContain(jar.refreshCookie);
    });

    it('rejects an expired absolute session through HTTP without issuing a successor', async () => {
      const jar = await login(appOrigin);
      await dataSource.query(
        `UPDATE "auth_sessions"
         SET "created_at" = now() - interval '31 days',
             "expires_at" = now() - interval '1 second'
         WHERE "user_id" = $1 AND "client_type" = 'app'`,
        [userId],
      );

      const response = await refresh(appOrigin, jar);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        statusCode: 401,
        message: 'Session is not available',
        error: 'Unauthorized',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(jar.refreshCookie);
    });
    it('refuses migration rollback while windows are active and reverses after expiry', async () => {
      const rateLimitMigration = new CreateAuthRateLimitWindows1791980000000();
      await dataSource.query(
        `INSERT INTO auth_rate_limit_windows
           (scope, subject_hash, window_started_at, attempt_count, expires_at)
         VALUES ('migration_rollback_probe', $1, clock_timestamp(), 1,
                 clock_timestamp() + interval '1 minute')`,
        [Buffer.alloc(32, 3)],
      );

      await expect(
        rateLimitMigration.down(dataSource.createQueryRunner()),
      ).rejects.toThrow('Rollback de rate limits cancelado');

      await dataSource.query(
        `UPDATE auth_rate_limit_windows
         SET window_started_at = clock_timestamp() - interval '2 minutes',
             expires_at = clock_timestamp() - interval '1 minute'`,
      );
      await rateLimitMigration.down(dataSource.createQueryRunner());
      const removedTable = (await dataSource.query(`
        SELECT to_regclass('public.auth_rate_limit_windows') AS table_name
      `)) as Array<{ table_name: string | null }>;
      expect(removedTable[0]?.table_name).toBeNull();

      await rateLimitMigration.up(dataSource.createQueryRunner());
      const restoredTable = (await dataSource.query(`
        SELECT to_regclass('public.auth_rate_limit_windows') AS table_name
      `)) as Array<{ table_name: string | null }>;
      expect(restoredTable[0]?.table_name).toBe('auth_rate_limit_windows');
    });
  },
);
