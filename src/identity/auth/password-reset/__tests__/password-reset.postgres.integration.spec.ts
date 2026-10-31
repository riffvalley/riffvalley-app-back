import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CreateAuthSessionPersistence1791950000000 } from '../../../../migrations/1791950000000-CreateAuthSessionPersistence';
import { AddRefreshOperationFingerprint1791960000000 } from '../../../../migrations/1791960000000-AddRefreshOperationFingerprint';
import { CreatePasswordResetPersistence1792050000000 } from '../../../../migrations/1792050000000-CreatePasswordResetPersistence';
import { User } from '../../entities/user.entity';
import { TypeOrmSessionsPersistence } from '../../../sessions/persistence/sessions.persistence';
import { SessionsService } from '../../../sessions/sessions.service';
import { UsersService } from '../../../users/users.service';
import {
  derivePasswordResetToken,
  hashPasswordResetToken,
  PasswordResetService,
} from '../password-reset.service';

const enabled = process.env.PASSWORD_RESET_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;
const TOKEN_SECRET = randomBytes(32).toString('base64url');

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('i1_11b_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Password reset PostgreSQL integration requires loopback PostgreSQL and a DB_NAME starting with i1_11b_.',
    );
  }
}

integrationSuite('Password reset PostgreSQL integration', () => {
  let adminDataSource: DataSource;
  let dataSource: DataSource;
  let usersService: UsersService;
  let sessionsService: SessionsService;
  let resetService: PasswordResetService;
  let schemaName: string;
  let originalTokenSecret: string | undefined;

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    await dataSource.query(
      'INSERT INTO users (id, password, email, "isActive") VALUES ($1, $2, $3, TRUE)',
      [userId, 'old-password-hash', `${userId}@example.test`],
    );
    return userId;
  }

  async function createSession(userId: string): Promise<string> {
    const sessionId = randomUUID();
    const now = new Date();
    await dataSource.query(
      `INSERT INTO auth_sessions
         (id, user_id, client_type, created_at, expires_at, last_activity_at)
       VALUES ($1, $2, 'app', $3, $4, $3)`,
      [sessionId, userId, now, new Date(now.getTime() + 60_000)],
    );
    await dataSource.query(
      `INSERT INTO auth_refresh_tokens
         (id, session_id, token_hash, created_at, consumed_at)
       VALUES ($1, $2, $3, $4, NULL)`,
      [randomUUID(), sessionId, randomBytes(32), now],
    );
    return sessionId;
  }

  async function migrate(migration: {
    up(queryRunner: ReturnType<DataSource['createQueryRunner']>): Promise<void>;
  }): Promise<void> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await migration.up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  beforeAll(async () => {
    assertIsolatedTarget();
    originalTokenSecret = process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET;
    process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET = TOKEN_SECRET;
    schemaName = `i1_11b_${randomUUID().replaceAll('-', '')}`;
    const connectionOptions = {
      type: 'postgres' as const,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      synchronize: false,
      migrationsRun: false,
    };
    adminDataSource = new DataSource(connectionOptions);
    await adminDataSource.initialize();
    await adminDataSource.query(`CREATE SCHEMA "${schemaName}"`);

    dataSource = new DataSource({
      ...connectionOptions,
      schema: schemaName,
      entities: ['src/**/*.entity.ts'],
      extra: {
        max: 4,
        options: `-c search_path=${schemaName},public`,
      },
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY,
        "password" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "isActive" boolean NOT NULL DEFAULT TRUE
      )
    `);
    await migrate(new CreateAuthSessionPersistence1791950000000());
    await migrate(new AddRefreshOperationFingerprint1791960000000());
    await migrate(new CreatePasswordResetPersistence1792050000000());

    usersService = new UsersService(dataSource.getRepository(User));
    sessionsService = new SessionsService(
      new TypeOrmSessionsPersistence(dataSource),
    );
    resetService = new PasswordResetService(
      dataSource,
      new ConfigService(),
      usersService,
      sessionsService,
    );
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dataSource?.destroy();
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      );
      await adminDataSource.destroy();
    }
    if (originalTokenSecret === undefined) {
      delete process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET;
    } else {
      process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET = originalTokenSecret;
    }
  });

  it('keeps a pending token unusable and activates it for exactly 30 minutes', async () => {
    const userId = await createUser();
    const request = await resetService.createPendingRequest(userId);
    expect(request).not.toBeNull();
    if (!request) throw new Error('Expected a pending request');

    const pendingRows = (await dataSource.query(
      `SELECT token_hash, status, expires_at
       FROM auth_password_reset_requests WHERE id = $1`,
      [request.requestId],
    )) as Array<{
      token_hash: Buffer;
      status: string;
      expires_at: Date | null;
    }>;
    const token = await resetService.deriveTokenForDelivery(request.requestId);
    expect(pendingRows[0].status).toBe('pending_delivery');
    expect(pendingRows[0].expires_at).toBeNull();
    expect(pendingRows[0].token_hash).toEqual(hashPasswordResetToken(token));
    const [requestRawTokenColumns] = (await dataSource.query(
      `SELECT COUNT(*)::integer AS count
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'auth_password_reset_requests'
         AND column_name IN ('token', 'raw_token', 'plaintext_token')`,
      [schemaName],
    )) as Array<{ count: number }>;
    const [outboxTokenColumns] = (await dataSource.query(
      `SELECT COUNT(*)::integer AS count
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'auth_password_reset_outbox'
         AND column_name IN ('token', 'token_hash', 'raw_token', 'plaintext_token')`,
      [schemaName],
    )) as Array<{ count: number }>;
    expect(requestRawTokenColumns.count).toBe(0);
    expect(outboxTokenColumns.count).toBe(0);
    await expect(
      resetService.resetPassword(token, 'NewPassword1'),
    ).rejects.toThrow();

    const previousSecret = process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET;
    process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET =
      randomBytes(32).toString('base64url');
    await expect(
      resetService.deriveTokenForDelivery(request.requestId),
    ).rejects.toThrow();
    process.env.AUTH_PASSWORD_RESET_TOKEN_SECRET = previousSecret;

    const beforeActivation = Date.now();
    await expect(
      resetService.activateDeliveredRequest(request.requestId),
    ).resolves.toBe(true);
    const [active] = (await dataSource.query(
      `SELECT activated_at, expires_at FROM auth_password_reset_requests WHERE id = $1`,
      [request.requestId],
    )) as Array<{ activated_at: Date; expires_at: Date }>;
    expect(active.expires_at.getTime() - active.activated_at.getTime()).toBe(
      30 * 60 * 1000,
    );
    expect(active.activated_at.getTime()).toBeGreaterThanOrEqual(
      beforeActivation,
    );
  });

  it('leases work to one concurrent worker and recovers an SMTP ACK gap after restart', async () => {
    const userId = await createUser();
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');

    const claims = await Promise.all([
      resetService.claimPendingDeliveries(1, 60, 5),
      resetService.claimPendingDeliveries(1, 60, 5),
    ]);
    const claimed = claims.flat();
    expect(claimed).toHaveLength(1);
    expect(claimed[0].requestId).toBe(request.requestId);
    const firstDelivery = await resetService.getClaimedDelivery(
      request.requestId,
      claimed[0].lockedUntil,
    );
    if (!firstDelivery) throw new Error('Expected a claimed delivery');

    // Simulate SMTP acceptance followed by process death before DB activation.
    await dataSource.query(
      `UPDATE auth_password_reset_outbox
       SET locked_until = clock_timestamp() - INTERVAL '1 second'
       WHERE request_id = $1`,
      [request.requestId],
    );
    const restartedWorkerClaim = await resetService.claimPendingDeliveries(
      1,
      60,
      5,
    );
    expect(restartedWorkerClaim).toHaveLength(1);
    const retriedDelivery = await resetService.getClaimedDelivery(
      request.requestId,
      restartedWorkerClaim[0].lockedUntil,
    );
    if (!retriedDelivery) throw new Error('Expected a recovered delivery');
    expect(retriedDelivery?.token).toBe(firstDelivery.token);
    await resetService.activateDeliveredRequest(request.requestId);
    await expect(
      resetService.resetPassword(firstDelivery.token, 'RestartedPassword1'),
    ).resolves.toBeUndefined();
    await expect(
      resetService.resetPassword(retriedDelivery.token, 'SecondPassword1'),
    ).rejects.toThrow();
  });

  it('consumes once and changes password, credential version and sessions atomically', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');
    const token = await resetService.deriveTokenForDelivery(request.requestId);
    await resetService.activateDeliveredRequest(request.requestId);

    const logSpy = jest.spyOn(Logger.prototype, 'log');
    await resetService.resetPassword(token, 'NewPassword1');
    await expect(
      resetService.resetPassword(token, 'AnotherPassword2'),
    ).rejects.toThrow();

    const [user] = (await dataSource.query(
      'SELECT password, credential_version FROM users WHERE id = $1',
      [userId],
    )) as Array<{ password: string; credential_version: number }>;
    expect(await bcrypt.compare('NewPassword1', user.password)).toBe(true);
    expect(user.credential_version).toBe(1);

    const [requestState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_requests WHERE id = $1',
      [request.requestId],
    )) as Array<{ status: string }>;
    const [session] = (await dataSource.query(
      'SELECT revoked_at FROM auth_sessions WHERE id = $1',
      [sessionId],
    )) as Array<{ revoked_at: Date | null }>;
    const [refresh] = (await dataSource.query(
      'SELECT consumed_at FROM auth_refresh_tokens WHERE session_id = $1',
      [sessionId],
    )) as Array<{ consumed_at: Date | null }>;
    expect(requestState.status).toBe('consumed');
    expect(session.revoked_at).toBeInstanceOf(Date);
    expect(refresh.consumed_at).toBeInstanceOf(Date);
    const logs = logSpy.mock.calls.flat().join(' ');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain('NewPassword1');
    expect(logs).not.toContain(TOKEN_SECRET);
  });

  it('terminally fails an expired final lease after a worker restart', async () => {
    const userId = await createUser();
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');
    await resetService.claimPendingDeliveries(1, 60, 1);
    await dataSource.query(
      `UPDATE auth_password_reset_outbox
       SET locked_until = clock_timestamp() - INTERVAL '1 second'
       WHERE request_id = $1`,
      [request.requestId],
    );

    await resetService.failExhaustedDeliveries(1, 10);
    const [requestState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_requests WHERE id = $1',
      [request.requestId],
    )) as Array<{ status: string }>;
    const [outboxState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_outbox WHERE request_id = $1',
      [request.requestId],
    )) as Array<{ status: string }>;
    expect(requestState.status).toBe('failed');
    expect(outboxState.status).toBe('failed');
  });

  it('retries transient SMTP failures with backoff and fails at the attempt limit', async () => {
    const userId = await createUser();
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');
    const firstClaim = await resetService.claimPendingDeliveries(1, 60, 2);
    expect(firstClaim).toHaveLength(1);

    await resetService.retryPendingDelivery(
      request.requestId,
      30,
      2,
      firstClaim[0].lockedUntil,
    );
    const [rescheduled] = (await dataSource.query(
      'SELECT status, attempt_count, available_at FROM auth_password_reset_outbox WHERE request_id = $1',
      [request.requestId],
    )) as Array<{ status: string; attempt_count: number; available_at: Date }>;
    expect(rescheduled.status).toBe('queued');
    expect(rescheduled.attempt_count).toBe(1);
    expect(rescheduled.available_at.getTime()).toBeGreaterThan(Date.now());

    await dataSource.query(
      `UPDATE auth_password_reset_outbox
       SET available_at = clock_timestamp() - INTERVAL '1 second'
       WHERE request_id = $1`,
      [request.requestId],
    );
    const finalClaim = await resetService.claimPendingDeliveries(1, 60, 2);
    const finalLease = finalClaim[0];
    if (!finalLease) throw new Error('Expected the final delivery attempt');
    expect(finalLease.attemptCount).toBe(2);
    await resetService.retryPendingDelivery(
      request.requestId,
      60,
      2,
      finalLease.lockedUntil,
    );

    const [requestState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_requests WHERE id = $1',
      [request.requestId],
    )) as Array<{ status: string }>;
    const [outboxState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_outbox WHERE request_id = $1',
      [request.requestId],
    )) as Array<{ status: string }>;
    expect(requestState.status).toBe('failed');
    expect(outboxState.status).toBe('failed');
  });

  it('cleans old expired and terminal requests while preserving pending deliveries', async () => {
    const expiredUserId = await createUser();
    const expiredRequest =
      await resetService.createPendingRequest(expiredUserId);
    if (!expiredRequest) throw new Error('Expected an expired test request');
    await resetService.activateDeliveredRequest(expiredRequest.requestId);
    await dataSource.query(
      `UPDATE auth_password_reset_requests
       SET requested_at = clock_timestamp() - INTERVAL '40 days',
           expires_at = clock_timestamp() - INTERVAL '31 days'
       WHERE id = $1`,
      [expiredRequest.requestId],
    );

    const pendingUserId = await createUser();
    const pendingRequest =
      await resetService.createPendingRequest(pendingUserId);
    if (!pendingRequest) throw new Error('Expected a pending delivery');

    await expect(resetService.cleanupTerminalRequests(30, 500)).resolves.toBe(
      1,
    );
    const [expiredRows] = (await dataSource.query(
      'SELECT COUNT(*)::integer AS count FROM auth_password_reset_requests WHERE id = $1',
      [expiredRequest.requestId],
    )) as Array<{ count: number }>;
    const [outboxRows] = (await dataSource.query(
      'SELECT COUNT(*)::integer AS count FROM auth_password_reset_outbox WHERE request_id = $1',
      [expiredRequest.requestId],
    )) as Array<{ count: number }>;
    const [pendingRows] = (await dataSource.query(
      'SELECT COUNT(*)::integer AS count FROM auth_password_reset_requests WHERE id = $1',
      [pendingRequest.requestId],
    )) as Array<{ count: number }>;
    expect(expiredRows.count).toBe(0);
    expect(outboxRows.count).toBe(0);
    expect(pendingRows.count).toBe(1);
  });

  it('serializes concurrent requests so only one remains current', async () => {
    const userId = await createUser();
    const requests = await Promise.all([
      resetService.createPendingRequest(userId),
      resetService.createPendingRequest(userId),
    ]);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request !== null)).toBe(true);

    const activeRequests = (await dataSource.query(
      `SELECT id, status FROM auth_password_reset_requests
       WHERE user_id = $1 AND status IN ('pending_delivery', 'active')`,
      [userId],
    )) as Array<{ id: string; status: string }>;
    expect(activeRequests).toHaveLength(1);
    expect(activeRequests[0].status).toBe('pending_delivery');
  });

  it('invalidates earlier requests and permits only the latest activated link', async () => {
    const userId = await createUser();
    const first = await resetService.createPendingRequest(userId);
    if (!first) throw new Error('Expected first request');
    const firstToken = await resetService.deriveTokenForDelivery(
      first.requestId,
    );
    await resetService.activateDeliveredRequest(first.requestId);

    const second = await resetService.createPendingRequest(userId);
    if (!second) throw new Error('Expected second request');
    await expect(
      resetService.resetPassword(firstToken, 'Invalidated1'),
    ).rejects.toThrow();
    const [firstState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_requests WHERE id = $1',
      [first.requestId],
    )) as Array<{ status: string }>;
    expect(firstState.status).toBe('invalidated');
    const secondToken = await resetService.deriveTokenForDelivery(
      second.requestId,
    );
    await resetService.activateDeliveredRequest(second.requestId);
    await resetService.resetPassword(secondToken, 'CurrentPassword1');
  });

  it('allows exactly one of two simultaneous uses of a reset token', async () => {
    const userId = await createUser();
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');
    const token = await resetService.deriveTokenForDelivery(request.requestId);
    await resetService.activateDeliveredRequest(request.requestId);

    const results = await Promise.allSettled([
      resetService.resetPassword(token, 'ConcurrentPassword1'),
      resetService.resetPassword(token, 'ConcurrentPassword2'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const [user] = (await dataSource.query(
      'SELECT password, credential_version FROM users WHERE id = $1',
      [userId],
    )) as Array<{ password: string; credential_version: number }>;
    expect(user.credential_version).toBe(1);
    expect(await bcrypt.compare('ConcurrentPassword1', user.password)).toBe(
      true,
    );
  });

  it('rejects an expired token using the database clock', async () => {
    const userId = await createUser();
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');
    const token = await resetService.deriveTokenForDelivery(request.requestId);
    await resetService.activateDeliveredRequest(request.requestId);
    await dataSource.query(
      `UPDATE auth_password_reset_requests
       SET expires_at = clock_timestamp() - INTERVAL '1 second'
       WHERE id = $1`,
      [request.requestId],
    );

    await expect(
      resetService.resetPassword(token, 'ExpiredPassword1'),
    ).rejects.toThrow();
  });

  it('rolls back password, token consumption and session revocation on a later transaction failure', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);
    const request = await resetService.createPendingRequest(userId);
    if (!request) throw new Error('Expected a pending request');
    const token = await resetService.deriveTokenForDelivery(request.requestId);
    await resetService.activateDeliveredRequest(request.requestId);

    const failingRevoker = {
      revokeAllSessionsForUserInTransaction: async (
        ownerId: string,
        manager: EntityManager,
      ): Promise<number> => {
        await manager.query(
          'UPDATE auth_sessions SET revoked_at = clock_timestamp() WHERE user_id = $1',
          [ownerId],
        );
        throw new Error('injected session revocation failure');
      },
    };
    const failingService = new PasswordResetService(
      dataSource,
      new ConfigService(),
      usersService,
      failingRevoker,
    );

    await expect(
      failingService.resetPassword(token, 'RolledBackPassword1'),
    ).rejects.toThrow('injected session revocation failure');
    const [user] = (await dataSource.query(
      'SELECT password, credential_version FROM users WHERE id = $1',
      [userId],
    )) as Array<{ password: string; credential_version: number }>;
    const [requestState] = (await dataSource.query(
      'SELECT status FROM auth_password_reset_requests WHERE id = $1',
      [request.requestId],
    )) as Array<{ status: string }>;
    const [session] = (await dataSource.query(
      'SELECT revoked_at FROM auth_sessions WHERE id = $1',
      [sessionId],
    )) as Array<{ revoked_at: Date | null }>;
    expect(user.password).toBe('old-password-hash');
    expect(user.credential_version).toBe(0);
    expect(requestState.status).toBe('active');
    expect(session.revoked_at).toBeNull();
  });

  it('cannot derive a valid token from request data without the dedicated secret', () => {
    const requestId = randomUUID();
    const otherSecret = randomBytes(32);
    const token = derivePasswordResetToken(requestId, otherSecret);
    expect(hashPasswordResetToken(token)).not.toEqual(
      hashPasswordResetToken(
        derivePasswordResetToken(requestId, randomBytes(32)),
      ),
    );
    expect(TOKEN_SECRET).not.toBe(token);
  });
});
