import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, Logger as TypeOrmLogger } from 'typeorm';
import { CreateAuthSessionPersistence1791950000000 } from '../../../migrations/1791950000000-CreateAuthSessionPersistence';
import { AddRefreshOperationFingerprint1791960000000 } from '../../../migrations/1791960000000-AddRefreshOperationFingerprint';
import { AddSessionCleanupIndex1791970000000 } from '../../../migrations/1791970000000-AddSessionCleanupIndex';
import {
  InvalidSessionClientError,
  InvalidSessionCredentialError,
  RefreshOperationAlreadyProcessedError,
  RefreshTokenReuseDetectedError,
} from '../errors/sessions.errors';
import { TypeOrmSessionsPersistence } from '../persistence/sessions.persistence';
import { SessionsService } from '../sessions.service';
import type {
  SessionsPersistence,
  SessionsUnitOfWork,
} from '../persistence/sessions.persistence';

const enabled = process.env.SESSIONS_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !(database?.startsWith('bc_id_5c_') || database?.startsWith('bc_id_5d_')) ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'PostgreSQL integration tests require an explicit loopback-only database whose name starts with bc_id_5c_ or bc_id_5d_.',
    );
  }
}

class LockQueryCaptureLogger implements TypeOrmLogger {
  readonly lockQueries: string[] = [];

  logQuery(query: string): void {
    if (/FOR UPDATE/i.test(query)) this.lockQueries.push(query);
  }

  logQueryError(): void {}

  logQuerySlow(): void {}

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(): void {}
}

class RefreshLookupBarrier implements SessionsPersistence {
  private arrivals = 0;
  private readonly gate: Promise<void>;
  private releaseGate: (() => void) | undefined;

  constructor(private readonly persistence: SessionsPersistence) {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  withTransaction<T>(
    operation: (unitOfWork: SessionsUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.persistence.withTransaction((unitOfWork) =>
      operation(
        new Proxy(unitOfWork, {
          get: (target, property) => {
            if (property === 'findRefreshTokenByHash') {
              return async (hash: Buffer) => {
                const location = await target.findRefreshTokenByHash(hash);
                this.arrivals += 1;
                if (this.arrivals === 2) this.releaseGate?.();
                await this.gate;
                return location;
              };
            }
            const member = Reflect.get(target, property, target);
            return typeof member === 'function' ? member.bind(target) : member;
          },
        }),
      ),
    );
  }

  purgeExpiredSessions(
    retentionCutoff: Date,
    tokenBatchSize: number,
    sessionBatchSize: number,
  ): Promise<{ refreshTokensDeleted: number; sessionsDeleted: number }> {
    return this.persistence.purgeExpiredSessions(
      retentionCutoff,
      tokenBatchSize,
      sessionBatchSize,
    );
  }
}

integrationSuite('Sessions PostgreSQL integration', () => {
  let dataSource: DataSource;
  let persistence: TypeOrmSessionsPersistence;
  let service: SessionsService;
  let lockLogger: LockQueryCaptureLogger;

  async function createUser(isActive = true): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO "users" ("id", "isActive") VALUES ($1, $2)',
      [id, isActive],
    );
    return id;
  }

  async function createSession(clientType: 'app' | 'wiki' = 'app') {
    const userId = await createUser();
    const credential = await service.createSession({ userId, clientType });
    return { userId, credential };
  }

  beforeAll(async () => {
    assertIsolatedTarget();
    lockLogger = new LockQueryCaptureLogger();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      synchronize: false,
      migrationsRun: false,
      logging: ['query'],
      logger: lockLogger,
      entities: ['src/**/*.entity.ts'],
      migrations: [
        CreateAuthSessionPersistence1791950000000,
        AddRefreshOperationFingerprint1791960000000,
        AddSessionCleanupIndex1791970000000,
      ],
    });
    await dataSource.initialize();
    persistence = new TypeOrmSessionsPersistence(dataSource);
    service = new SessionsService(persistence);

    const existingTables = (await dataSource.query(`
      SELECT count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `)) as Array<{ count: number }>;
    if (existingTables[0]?.count !== 0) {
      throw new Error(
        'The disposable sessions integration database must start empty.',
      );
    }

    await dataSource.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY,
        "isActive" boolean NOT NULL DEFAULT true
      )
    `);
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    expect(applied.map((migration) => migration.name)).toEqual([
      'CreateAuthSessionPersistence1791950000000',
      'AddRefreshOperationFingerprint1791960000000',
      'AddSessionCleanupIndex1791970000000',
    ]);
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('applies the ordered migrations and verifies uuid-ossp, constraints and indexes', async () => {
    const uuidFunction = (await dataSource.query(
      "SELECT to_regprocedure('uuid_generate_v4()') IS NOT NULL AS available",
    )) as Array<{ available: boolean }>;
    expect(uuidFunction[0]?.available).toBe(true);
    const generatedUuid = (await dataSource.query(
      'SELECT uuid_generate_v4()::text AS value',
    )) as Array<{ value: string }>;
    expect(generatedUuid[0]?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const ledger = (await dataSource.query(
      'SELECT name FROM "migrations" ORDER BY timestamp, id',
    )) as Array<{ name: string }>;
    expect(ledger.map((migration) => migration.name)).toEqual([
      'CreateAuthSessionPersistence1791950000000',
      'AddRefreshOperationFingerprint1791960000000',
      'AddSessionCleanupIndex1791970000000',
    ]);

    const indexes = (await dataSource.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('auth_sessions', 'auth_refresh_tokens')
    `)) as Array<{ indexname: string }>;
    const indexNames = indexes.map((index) => index.indexname);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'UQ_auth_refresh_tokens_token_hash',
        'IDX_auth_refresh_tokens_session_consumed',
        'UQ_auth_refresh_tokens_one_unconsumed_per_session',
        'IDX_auth_sessions_expires_at',
        'IDX_auth_sessions_revoked_at',
      ]),
    );

    const columns = (await dataSource.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'auth_refresh_tokens'
    `)) as Array<{ column_name: string }>;
    expect(columns.map((column) => column.column_name)).toContain(
      'operation_key_hash',
    );
    expect(columns.map((column) => column.column_name)).not.toContain(
      'refresh_token',
    );
  });

  it('creates a session with an absolute 30-day expiry and stores only the refresh hash', async () => {
    const { userId, credential } = await createSession();
    expect(
      credential.expiresAt.getTime() - credential.createdAt.getTime(),
    ).toBe(30 * 24 * 60 * 60 * 1000);

    const rows = (await dataSource.query(
      'SELECT token_hash, consumed_at FROM "auth_refresh_tokens" WHERE session_id = $1',
      [credential.sessionId],
    )) as Array<{ token_hash: Buffer; consumed_at: Date | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toEqual(digest(credential.refreshToken));
    expect(rows[0]?.token_hash.toString('utf8')).not.toBe(
      credential.refreshToken,
    );

    const sessionOwner = (await dataSource.query(
      'SELECT user_id, client_type, expires_at FROM "auth_sessions" WHERE id = $1',
      [credential.sessionId],
    )) as Array<{ user_id: string; client_type: string; expires_at: Date }>;
    expect(sessionOwner[0]?.user_id).toBe(userId);
    expect(sessionOwner[0]?.client_type).toBe('app');
    expect(sessionOwner[0]?.expires_at.getTime()).toBe(
      credential.expiresAt.getTime(),
    );
  });

  it('enforces database client, foreign-key, expiration and active-token constraints', async () => {
    const { userId, credential } = await createSession();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 60_000);

    await expect(
      service.createSession({ userId, clientType: 'mobile' }),
    ).rejects.toBeInstanceOf(InvalidSessionClientError);
    await expect(
      dataSource.query(
        `INSERT INTO "auth_sessions" ("user_id", "client_type", "created_at", "expires_at")
         VALUES ($1, 'mobile', $2, $3)`,
        [userId, createdAt, expiresAt],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "auth_sessions" ("user_id", "client_type", "created_at", "expires_at")
         VALUES ($1, 'app', $2, $3)`,
        [randomUUID(), createdAt, expiresAt],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "auth_sessions" ("user_id", "client_type", "created_at", "expires_at")
         VALUES ($1, 'app', $2, $2)`,
        [userId, createdAt],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "auth_refresh_tokens" ("session_id", "token_hash")
         VALUES ($1, $2)`,
        [credential.sessionId, randomBytes(32)],
      ),
    ).rejects.toThrow();

    const other = await createSession();
    const storedHash = (await dataSource.query(
      'SELECT token_hash FROM "auth_refresh_tokens" WHERE session_id = $1',
      [credential.sessionId],
    )) as Array<{ token_hash: Buffer }>;
    await expect(
      dataSource.query(
        `INSERT INTO "auth_refresh_tokens" ("session_id", "token_hash")
         VALUES ($1, $2)`,
        [other.credential.sessionId, storedHash[0]?.token_hash],
      ),
    ).rejects.toThrow();
  });

  it('rotates once, preserves absolute expiration and rejects a client mismatch', async () => {
    const { credential } = await createSession('wiki');
    await expect(
      service.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);

    lockLogger.lockQueries.length = 0;
    const successor = await service.rotateRefreshToken({
      refreshToken: credential.refreshToken,
      clientType: 'wiki',
      operationId: randomUUID(),
    });
    expect(successor.expiresAt.getTime()).toBe(credential.expiresAt.getTime());
    const rows = (await dataSource.query(
      `SELECT consumed_at, operation_key_hash FROM "auth_refresh_tokens"
       WHERE session_id = $1 ORDER BY created_at`,
      [credential.sessionId],
    )) as Array<{
      consumed_at: Date | null;
      operation_key_hash: Buffer | null;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.consumed_at).toBeInstanceOf(Date);
    expect(rows[0]?.operation_key_hash).toHaveLength(32);
    expect(rows[1]?.consumed_at).toBeNull();
    expect(rows[1]?.operation_key_hash).toBeNull();
    expect(lockLogger.lockQueries).toHaveLength(2);
    expect(lockLogger.lockQueries[0]).toMatch(
      /"auth_sessions"[\s\S]*FOR UPDATE/i,
    );
    expect(lockLogger.lockQueries[1]).toMatch(
      /"auth_refresh_tokens"[\s\S]*FOR UPDATE/i,
    );
    expect(lockLogger.lockQueries.join(' ')).not.toContain(
      credential.refreshToken,
    );
  });

  it('returns no credentials for a same-operation retry and revokes the family for another operation', async () => {
    const { credential } = await createSession();
    const operationId = randomUUID();
    await service.rotateRefreshToken({
      refreshToken: credential.refreshToken,
      clientType: 'app',
      operationId,
    });

    await expect(
      service.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId,
      }),
    ).rejects.toBeInstanceOf(RefreshOperationAlreadyProcessedError);
    await expect(
      service.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);

    const state = (await dataSource.query(
      'SELECT revoked_at FROM "auth_sessions" WHERE id = $1',
      [credential.sessionId],
    )) as Array<{ revoked_at: Date | null }>;
    expect(state[0]?.revoked_at).toBeInstanceOf(Date);
    const active = (await dataSource.query(
      'SELECT count(*)::int AS count FROM "auth_refresh_tokens" WHERE session_id = $1 AND consumed_at IS NULL',
      [credential.sessionId],
    )) as Array<{ count: number }>;
    expect(active[0]?.count).toBe(0);
  });

  it('uses independent PostgreSQL connections to serialize two simultaneous rotations', async () => {
    const { credential } = await createSession();
    const base = new TypeOrmSessionsPersistence(dataSource);
    const barrier = new RefreshLookupBarrier(base);
    const firstService = new SessionsService(barrier);
    const secondService = new SessionsService(barrier);
    const results = await Promise.allSettled([
      firstService.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId: 'd65f45e4-9fe6-4d4a-b754-4256ba06b833',
      }),
      secondService.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId: 'd65f45e4-9fe6-4d4a-b754-4256ba06b833',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejection?.reason).toBeInstanceOf(
      RefreshOperationAlreadyProcessedError,
    );
    const counts = (await dataSource.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE consumed_at IS NULL)::int AS active
       FROM "auth_refresh_tokens" WHERE session_id = $1`,
      [credential.sessionId],
    )) as Array<{ total: number; active: number }>;
    expect(counts[0]).toEqual({ total: 2, active: 1 });
  }, 15000);

  it('revokes the family when concurrent attempts use different operation IDs', async () => {
    const { credential } = await createSession();
    const barrier = new RefreshLookupBarrier(
      new TypeOrmSessionsPersistence(dataSource),
    );
    const firstService = new SessionsService(barrier);
    const secondService = new SessionsService(barrier);
    const results = await Promise.allSettled([
      firstService.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId: 'd65f45e4-9fe6-4d4a-b754-4256ba06b833',
      }),
      secondService.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId: 'c8aeb947-c87f-495f-9cb0-3ddc355e4336',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejection?.reason).toBeInstanceOf(RefreshTokenReuseDetectedError);

    const state = (await dataSource.query(
      `SELECT s.revoked_at,
              count(*) FILTER (WHERE r.consumed_at IS NULL)::int AS active
       FROM "auth_sessions" s
       JOIN "auth_refresh_tokens" r ON r.session_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [credential.sessionId],
    )) as Array<{ revoked_at: Date | null; active: number }>;
    expect(state[0]?.revoked_at).toBeInstanceOf(Date);
    expect(state[0]?.active).toBe(0);
  }, 15000);

  it('treats a same-operation retry after the two-minute window as reuse', async () => {
    const { credential } = await createSession();
    const operationId = randomUUID();
    await service.rotateRefreshToken({
      refreshToken: credential.refreshToken,
      clientType: 'app',
      operationId,
    });
    await dataSource.query(
      `UPDATE "auth_refresh_tokens"
       SET "consumed_at" = now() - interval '3 minutes'
       WHERE "token_hash" = $1`,
      [digest(credential.refreshToken)],
    );

    await expect(
      service.rotateRefreshToken({
        refreshToken: credential.refreshToken,
        clientType: 'app',
        operationId,
      }),
    ).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);
    const state = (await dataSource.query(
      'SELECT revoked_at FROM "auth_sessions" WHERE id = $1',
      [credential.sessionId],
    )) as Array<{ revoked_at: Date | null }>;
    expect(state[0]?.revoked_at).toBeInstanceOf(Date);
  });

  it('revokes individual and all app/wiki sessions and rejects expired or revoked sessions', async () => {
    const userId = await createUser();
    const app = await service.createSession({ userId, clientType: 'app' });
    const wiki = await service.createSession({ userId, clientType: 'wiki' });
    expect(
      await service.revokeSession({
        sessionId: app.sessionId,
        userId,
        clientType: 'app',
      }),
    ).toBe(true);
    await expect(
      service.rotateRefreshToken({
        refreshToken: app.refreshToken,
        clientType: 'app',
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);
    expect(await service.revokeAllSessionsForUser(userId)).toBe(1);
    await expect(
      service.rotateRefreshToken({
        refreshToken: wiki.refreshToken,
        clientType: 'wiki',
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);

    const expired = await createSession();
    await dataSource.query(
      `UPDATE "auth_sessions"
       SET "created_at" = now() - interval '31 days',
           "expires_at" = now() - interval '1 second'
       WHERE id = $1`,
      [expired.credential.sessionId],
    );
    await expect(
      service.rotateRefreshToken({
        refreshToken: expired.credential.refreshToken,
        clientType: 'app',
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);

    const inactive = await createSession();
    await dataSource.query(
      'UPDATE "users" SET "isActive" = false WHERE id = $1',
      [inactive.userId],
    );
    await expect(
      service.rotateRefreshToken({
        refreshToken: inactive.credential.refreshToken,
        clientType: 'app',
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);
    const inactiveSession = (await dataSource.query(
      'SELECT revoked_at FROM "auth_sessions" WHERE id = $1',
      [inactive.credential.sessionId],
    )) as Array<{ revoked_at: Date | null }>;
    expect(inactiveSession[0]?.revoked_at).toBeInstanceOf(Date);
  });

  it('cleans expired and long-revoked families in bounded batches, preserving active sessions', async () => {
    const expired = await createSession();
    await service.rotateRefreshToken({
      refreshToken: expired.credential.refreshToken,
      clientType: 'app',
      operationId: randomUUID(),
    });
    const revoked = await createSession('wiki');
    await service.revokeSession({
      sessionId: revoked.credential.sessionId,
      userId: revoked.userId,
      clientType: 'wiki',
    });
    const active = await createSession();
    await dataSource.query(
      `UPDATE "auth_sessions"
       SET "created_at" = now() - interval '62 days',
           "expires_at" = now() - interval '32 days'
       WHERE id = $1`,
      [expired.credential.sessionId],
    );
    await dataSource.query(
      `UPDATE "auth_sessions"
       SET "revoked_at" = now() - interval '31 days'
       WHERE id = $1`,
      [revoked.credential.sessionId],
    );
    const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await expect(
      persistence.purgeExpiredSessions(retentionCutoff, -1, 1),
    ).rejects.toThrow();
    const before = (await dataSource.query(
      `SELECT count(*)::int AS count FROM "auth_refresh_tokens"
       WHERE session_id IN ($1, $2)`,
      [expired.credential.sessionId, revoked.credential.sessionId],
    )) as Array<{ count: number }>;
    expect(before[0]?.count).toBe(3);

    let totalTokensDeleted = 0;
    let totalSessionsDeleted = 0;
    for (let batch = 0; batch < 5; batch += 1) {
      const result = await persistence.purgeExpiredSessions(
        retentionCutoff,
        1,
        1,
      );
      expect(result.refreshTokensDeleted).toBeLessThanOrEqual(1);
      expect(result.sessionsDeleted).toBeLessThanOrEqual(1);
      totalTokensDeleted += result.refreshTokensDeleted;
      totalSessionsDeleted += result.sessionsDeleted;
    }

    expect(totalTokensDeleted).toBe(3);
    expect(totalSessionsDeleted).toBe(2);
    const remaining = (await dataSource.query(
      'SELECT id FROM "auth_sessions" WHERE id = $1',
      [active.credential.sessionId],
    )) as Array<{ id: string }>;
    expect(remaining).toHaveLength(1);
    await expect(
      persistence.purgeExpiredSessions(retentionCutoff, 1, 1),
    ).resolves.toEqual({ refreshTokensDeleted: 0, sessionsDeleted: 0 });
  }, 15000);

  it('skips a session locked by another connection and cleans it on a later batch', async () => {
    const expired = await createSession();
    await dataSource.query(
      `UPDATE "auth_sessions"
       SET "created_at" = now() - interval '62 days',
           "expires_at" = now() - interval '32 days'
       WHERE id = $1`,
      [expired.credential.sessionId],
    );
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        'SELECT id FROM "auth_sessions" WHERE id = $1 FOR UPDATE',
        [expired.credential.sessionId],
      );
      await expect(
        persistence.purgeExpiredSessions(
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          250,
          100,
        ),
      ).resolves.toEqual({ refreshTokensDeleted: 0, sessionsDeleted: 0 });
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }

    await expect(
      persistence.purgeExpiredSessions(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        250,
        100,
      ),
    ).resolves.toEqual({ refreshTokensDeleted: 1, sessionsDeleted: 1 });
  }, 15000);

  it('rolls back token consumption when successor persistence fails', async () => {
    const { credential } = await createSession();
    await dataSource.query(`
      CREATE FUNCTION fail_refresh_successor() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "auth_refresh_tokens" WHERE "session_id" = NEW."session_id"
        ) THEN
          RAISE EXCEPTION 'injected successor insert failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await dataSource.query(`
      CREATE TRIGGER fail_refresh_successor_before_insert
      BEFORE INSERT ON "auth_refresh_tokens"
      FOR EACH ROW EXECUTE FUNCTION fail_refresh_successor()
    `);

    try {
      await expect(
        service.rotateRefreshToken({
          refreshToken: credential.refreshToken,
          clientType: 'app',
          operationId: randomUUID(),
        }),
      ).rejects.toThrow('injected successor insert failure');
    } finally {
      await dataSource.query(
        'DROP TRIGGER fail_refresh_successor_before_insert ON "auth_refresh_tokens"',
      );
      await dataSource.query('DROP FUNCTION fail_refresh_successor()');
    }

    const rows = (await dataSource.query(
      'SELECT consumed_at FROM "auth_refresh_tokens" WHERE session_id = $1',
      [credential.sessionId],
    )) as Array<{ consumed_at: Date | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consumed_at).toBeNull();
  });

  it('refuses destructive rollback with stored rows, then rolls back the empty schema', async () => {
    const { credential } = await createSession();
    await service.rotateRefreshToken({
      refreshToken: credential.refreshToken,
      clientType: 'app',
      operationId: randomUUID(),
    });
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await expect(
        new AddRefreshOperationFingerprint1791960000000().down(queryRunner),
      ).rejects.toThrow('existen huellas de operación');
      await expect(
        new CreateAuthSessionPersistence1791950000000().down(queryRunner),
      ).rejects.toThrow('las tablas contienen sesiones');
    } finally {
      await queryRunner.release();
    }

    await dataSource.query('DELETE FROM "auth_sessions"');
    await dataSource.query('DELETE FROM "users"');
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();

    const remainingTables = (await dataSource.query(`
      SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('auth_sessions', 'auth_refresh_tokens')
    `)) as Array<{ count: number }>;
    expect(remainingTables[0]?.count).toBe(0);
  }, 15000);
});
