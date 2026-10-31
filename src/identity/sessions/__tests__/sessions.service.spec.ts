import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { AuthRefreshToken } from '../entities/auth-refresh-token.entity';
import { AuthSession } from '../entities/auth-session.entity';
import {
  InvalidSessionClientError,
  InvalidSessionCredentialError,
  RefreshOperationAlreadyProcessedError,
  RefreshTokenReuseDetectedError,
  SessionOwnerUnavailableError,
} from '../errors/sessions.errors';
import {
  NewRefreshTokenRecord,
  NewSessionRecord,
  SessionsPersistence,
  SessionsUnitOfWork,
  UserSessionState,
} from '../persistence/sessions.persistence';
import { SessionsService } from '../sessions.service';

const TEST_USER_ID = 'user-123';
const OPERATION_ID = 'd65f45e4-9fe6-4d4a-b754-4256ba06b833';
const SECOND_OPERATION_ID = 'c8aeb947-c87f-495f-9cb0-3ddc355e4336';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function copySession(session: AuthSession): AuthSession {
  const copy = Object.assign(new AuthSession(), session);
  copy.user = session.user;
  return copy;
}

function copyRefreshToken(token: AuthRefreshToken): AuthRefreshToken {
  const copy = Object.assign(new AuthRefreshToken(), token);
  copy.tokenHash = Buffer.from(token.tokenHash);
  copy.operationKeyHash = token.operationKeyHash
    ? Buffer.from(token.operationKeyHash)
    : null;
  return copy;
}

class MemorySessionsPersistence
  implements SessionsPersistence, SessionsUnitOfWork
{
  readonly users = new Map<string, UserSessionState>();
  readonly sessions = new Map<string, AuthSession>();
  readonly refreshTokens = new Map<string, AuthRefreshToken>();
  readonly events: string[] = [];
  failNextRefreshInsert = false;
  private transactionTail: Promise<void> = Promise.resolve();

  async withTransaction<T>(
    operation: (unitOfWork: SessionsUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const previous = this.transactionTail;
    let releaseTurn: (() => void) | undefined;
    this.transactionTail = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    await previous;

    const originalSessions = new Map(
      [...this.sessions].map(([id, session]) => [id, copySession(session)]),
    );
    const originalTokens = new Map(
      [...this.refreshTokens].map(([id, token]) => [
        id,
        copyRefreshToken(token),
      ]),
    );
    try {
      return await operation(this);
    } catch (error) {
      this.sessions.clear();
      originalSessions.forEach((session, id) => this.sessions.set(id, session));
      this.refreshTokens.clear();
      originalTokens.forEach((token, id) => this.refreshTokens.set(id, token));
      throw error;
    } finally {
      releaseTurn?.();
    }
  }

  async purgeExpiredSessions(
    retentionCutoff: Date,
    tokenBatchSize: number,
    sessionBatchSize: number,
  ): Promise<{ refreshTokensDeleted: number; sessionsDeleted: number }> {
    const eligible = [...this.sessions.values()].filter(
      (session) =>
        (session.revokedAt !== null && session.revokedAt < retentionCutoff) ||
        (session.revokedAt === null && session.expiresAt < retentionCutoff),
    );
    const eligibleIds = new Set(eligible.map((session) => session.id));
    const oldTokens = [...this.refreshTokens.values()]
      .filter((token) => eligibleIds.has(token.sessionId))
      .slice(0, tokenBatchSize);
    oldTokens.forEach((token) => this.refreshTokens.delete(token.id));

    const sessionsToDelete = eligible
      .filter(
        (session) =>
          ![...this.refreshTokens.values()].some(
            (token) => token.sessionId === session.id,
          ),
      )
      .slice(0, sessionBatchSize);
    sessionsToDelete.forEach((session) => this.sessions.delete(session.id));
    this.events.push('purge-expired-sessions');
    return {
      refreshTokensDeleted: oldTokens.length,
      sessionsDeleted: sessionsToDelete.length,
    };
  }

  async revokeAllSessionsForUserInTransaction(
    userId: string,
    manager: EntityManager,
  ): Promise<number> {
    void manager;
    const sessions = await this.lockActiveSessionsForUser(userId);
    const now = new Date();
    for (const session of sessions) {
      session.revokedAt = now;
      await this.saveSession(session);
    }
    await this.invalidateActiveRefreshTokens(
      sessions.map((session) => session.id),
      now,
    );
    return sessions.length;
  }

  async findUserState(
    userId: string,
    lockForSessionCreation: boolean,
  ): Promise<UserSessionState | null> {
    this.events.push(`find-user:${lockForSessionCreation}`);
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async createSession(record: NewSessionRecord): Promise<AuthSession> {
    const session = new AuthSession();
    session.id = randomUUID();
    session.userId = record.userId;
    session.user = Object.assign(new User(), { id: record.userId });
    session.clientType = record.clientType;
    session.createdAt = record.createdAt;
    session.expiresAt = record.expiresAt;
    session.revokedAt = null;
    session.lastActivityAt = record.createdAt;
    this.sessions.set(session.id, copySession(session));
    this.events.push('create-session');
    return copySession(session);
  }

  async createRefreshToken(
    record: NewRefreshTokenRecord,
  ): Promise<AuthRefreshToken> {
    if (this.failNextRefreshInsert) {
      this.failNextRefreshInsert = false;
      throw new Error('injected persistence failure');
    }
    if (
      [...this.refreshTokens.values()].some(
        (token) =>
          token.sessionId === record.sessionId && token.consumedAt === null,
      )
    ) {
      throw new Error('active refresh token uniqueness violated');
    }
    const token = new AuthRefreshToken();
    token.id = randomUUID();
    token.sessionId = record.sessionId;
    token.session = Object.assign(new AuthSession(), {
      id: record.sessionId,
    });
    token.tokenHash = Buffer.from(record.tokenHash);
    token.createdAt = record.createdAt;
    token.consumedAt = null;
    token.operationKeyHash = null;
    token.replacedBy = null;
    token.replacedById = null;
    this.refreshTokens.set(token.id, copyRefreshToken(token));
    this.events.push('create-refresh');
    return copyRefreshToken(token);
  }

  async findRefreshTokenByHash(hash: Buffer): Promise<AuthRefreshToken | null> {
    this.events.push('find-refresh-by-hash');
    const token = [...this.refreshTokens.values()].find((candidate) =>
      candidate.tokenHash.equals(hash),
    );
    if (!token) return null;
    const copy = copyRefreshToken(token);
    const session = this.sessions.get(token.sessionId);
    if (!session) return null;
    copy.session = copySession(session);
    return copy;
  }

  async lockSession(sessionId: string): Promise<AuthSession | null> {
    this.events.push('lock-session');
    const session = this.sessions.get(sessionId);
    return session ? copySession(session) : null;
  }

  async lockRefreshToken(
    refreshTokenId: string,
  ): Promise<AuthRefreshToken | null> {
    this.events.push('lock-refresh');
    const token = this.refreshTokens.get(refreshTokenId);
    return token ? copyRefreshToken(token) : null;
  }

  async saveSession(session: AuthSession): Promise<AuthSession> {
    this.sessions.set(session.id, copySession(session));
    this.events.push('save-session');
    return copySession(session);
  }

  async saveRefreshToken(token: AuthRefreshToken): Promise<AuthRefreshToken> {
    token.replacedById = token.replacedBy?.id ?? token.replacedById;
    this.refreshTokens.set(token.id, copyRefreshToken(token));
    this.events.push('save-refresh');
    return copyRefreshToken(token);
  }

  async lockActiveSessionsForUser(userId: string): Promise<AuthSession[]> {
    this.events.push('lock-user-sessions');
    return [...this.sessions.values()]
      .filter(
        (session) => session.userId === userId && session.revokedAt === null,
      )
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(copySession);
  }

  async invalidateActiveRefreshTokens(
    sessionIds: string[],
    consumedAt: Date,
  ): Promise<void> {
    const targetSessions = new Set(sessionIds);
    for (const token of this.refreshTokens.values()) {
      if (targetSessions.has(token.sessionId) && token.consumedAt === null) {
        token.consumedAt = consumedAt;
      }
    }
    this.events.push('invalidate-active-refresh');
  }
}

function makeService() {
  const persistence = new MemorySessionsPersistence();
  persistence.users.set(TEST_USER_ID, { id: TEST_USER_ID, isActive: true });
  return { persistence, service: new SessionsService(persistence) };
}

describe('SessionsService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('creates an app session with a 30-day absolute expiry and only a SHA-256 digest stored', async () => {
    const { persistence, service } = makeService();
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });

    expect(created.clientType).toBe('app');
    expect(created.expiresAt.getTime() - created.createdAt.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
    expect(created.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...persistence.refreshTokens.values()]).toEqual([
      expect.objectContaining({ tokenHash: digest(created.refreshToken) }),
    ]);
    expect(
      [...persistence.refreshTokens.values()].some(
        (token) => token.tokenHash.toString('utf8') === created.refreshToken,
      ),
    ).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('security_event=session_created'),
    );
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(
      created.refreshToken,
    );
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(
      digest(created.refreshToken).toString('hex'),
    );
  });

  it('resolves the refresh CSRF binding without changing session state', async () => {
    const { persistence, service } = makeService();
    const credential = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    const sessionBefore = [...persistence.sessions.values()].map(copySession);
    const tokensBefore = [...persistence.refreshTokens.values()].map(
      copyRefreshToken,
    );

    await expect(
      service.findRefreshTokenSessionBinding(credential.refreshToken, 'app'),
    ).resolves.toEqual({
      sessionId: credential.sessionId,
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    await expect(
      service.findRefreshTokenSessionBinding(credential.refreshToken, 'wiki'),
    ).resolves.toBeNull();
    await expect(
      service.findRefreshTokenSessionBinding('malformed', 'app'),
    ).resolves.toBeNull();
    expect([...persistence.sessions.values()]).toEqual(sessionBefore);
    expect([...persistence.refreshTokens.values()]).toEqual(tokensBefore);
  });

  it('recovers CSRF only for a live, unconsumed refresh session after proof expiry', async () => {
    const { persistence, service } = makeService();
    const credential = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    const sessionCsrfExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    jest.advanceTimersByTime(30 * 60 * 1000 + 1);

    await expect(
      service.findRecoverableRefreshTokenSessionBinding(
        credential.refreshToken,
        'app',
      ),
    ).resolves.toEqual({
      sessionId: credential.sessionId,
      userId: TEST_USER_ID,
      clientType: 'app',
      expiresAt: credential.expiresAt,
    });
    expect(credential.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(sessionCsrfExpiresAt.getTime()).toBeLessThan(Date.now());

    const activeToken = [...persistence.refreshTokens.values()][0];
    activeToken.consumedAt = new Date(Date.now());
    await expect(
      service.findRecoverableRefreshTokenSessionBinding(
        credential.refreshToken,
        'app',
      ),
    ).resolves.toBeNull();

    activeToken.consumedAt = null;
    const session = persistence.sessions.get(credential.sessionId);
    if (!session) throw new Error('Expected the session fixture to exist');
    session.expiresAt = new Date(Date.now() - 1);
    await expect(
      service.findRecoverableRefreshTokenSessionBinding(
        credential.refreshToken,
        'app',
      ),
    ).resolves.toBeNull();
  });

  it('rejects unrecognized clients and nonexistent or inactive owners', async () => {
    const { persistence, service } = makeService();

    await expect(
      service.createSession({ userId: TEST_USER_ID, clientType: 'mobile' }),
    ).rejects.toBeInstanceOf(InvalidSessionClientError);
    await expect(
      service.createSession({ userId: 'missing-user', clientType: 'wiki' }),
    ).rejects.toBeInstanceOf(SessionOwnerUnavailableError);

    persistence.users.set(TEST_USER_ID, { id: TEST_USER_ID, isActive: false });
    await expect(
      service.createSession({ userId: TEST_USER_ID, clientType: 'wiki' }),
    ).rejects.toBeInstanceOf(SessionOwnerUnavailableError);
    expect(persistence.sessions.size).toBe(0);
    expect(persistence.refreshTokens.size).toBe(0);
  });

  it('does not persist or log repeated-looking credentials for an unknown refresh token', async () => {
    const { persistence, service } = makeService();
    const logSpy = jest.spyOn(Logger.prototype, 'log');
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    await expect(
      service.rotateRefreshToken({
        refreshToken: Buffer.alloc(32, 7).toString('base64url'),
        clientType: 'app',
        operationId: OPERATION_ID,
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);

    expect(persistence.sessions.size).toBe(0);
    expect(persistence.refreshTokens.size).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('purges only expired or long-revoked families after retention and is repeatable', async () => {
    const { persistence, service } = makeService();
    const expired = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    const revoked = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'wiki',
    });
    const active = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiredRow = persistence.sessions.get(expired.sessionId);
    const revokedRow = persistence.sessions.get(revoked.sessionId);
    if (expiredRow) expiredRow.expiresAt = new Date(cutoff.getTime() - 1);
    if (revokedRow) revokedRow.revokedAt = new Date(cutoff.getTime() - 1);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    const trigger = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'wiki',
    });

    expect(persistence.sessions.has(expired.sessionId)).toBe(false);
    expect(persistence.sessions.has(revoked.sessionId)).toBe(false);
    expect(persistence.sessions.has(active.sessionId)).toBe(true);
    expect(
      [...persistence.refreshTokens.values()].some(
        (token) =>
          token.sessionId === expired.sessionId ||
          token.sessionId === revoked.sessionId,
      ),
    ).toBe(false);
    expect(persistence.sessions.has(trigger.sessionId)).toBe(true);
    const sessionCount = persistence.sessions.size;
    await persistence.purgeExpiredSessions(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      250,
      100,
    );
    expect(persistence.sessions.size).toBe(sessionCount);
  });

  it('does not fail session creation when opportunistic cleanup fails', async () => {
    const { persistence, service } = makeService();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    persistence.purgeExpiredSessions = async () => {
      throw new Error('database details must not be logged');
    };
    const credential = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });

    expect(credential.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(warnSpy).toHaveBeenCalledWith(
      'security_event=session_cleanup_failed',
    );
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain(
      'database details',
    );
  });

  it('rotates atomically, records the operation fingerprint and preserves absolute expiry', async () => {
    const { persistence, service } = makeService();
    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'wiki',
    });
    const originalExpiry = created.expiresAt.getTime();
    persistence.events.length = 0;
    jest.advanceTimersByTime(60_000);

    const rotated = await service.rotateRefreshToken({
      refreshToken: created.refreshToken,
      clientType: 'wiki',
      operationId: OPERATION_ID,
    });

    const tokenRows = [...persistence.refreshTokens.values()];
    const consumed = tokenRows.find((token) => token.consumedAt !== null);
    const active = tokenRows.find((token) => token.consumedAt === null);
    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    expect(rotated.expiresAt.getTime()).toBe(originalExpiry);
    expect(rotated.createdAt).toEqual(created.createdAt);
    expect(consumed?.operationKeyHash).toEqual(digest(OPERATION_ID));
    expect(consumed?.replacedById).toBe(active?.id);
    expect(active?.tokenHash).toEqual(digest(rotated.refreshToken));
    expect(tokenRows.filter((token) => token.consumedAt === null)).toHaveLength(
      1,
    );
    expect(persistence.events.slice(0, 3)).toEqual([
      'find-refresh-by-hash',
      'lock-session',
      'lock-refresh',
    ]);
  });

  it('treats a same-operation retry in the short window as processed without returning credentials', async () => {
    const { persistence, service } = makeService();
    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    await service.rotateRefreshToken({
      refreshToken: created.refreshToken,
      clientType: 'app',
      operationId: OPERATION_ID,
    });

    await expect(
      service.rotateRefreshToken({
        refreshToken: created.refreshToken,
        clientType: 'app',
        operationId: OPERATION_ID,
      }),
    ).rejects.toBeInstanceOf(RefreshOperationAlreadyProcessedError);
    expect(persistence.sessions.get(created.sessionId)?.revokedAt).toBeNull();
    expect(persistence.refreshTokens.size).toBe(2);
  });

  it('serializes simultaneous same-operation attempts to one successor and a non-credential conflict', async () => {
    const { persistence, service } = makeService();
    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    const input = {
      refreshToken: created.refreshToken,
      clientType: 'app',
      operationId: OPERATION_ID,
    };

    const results = await Promise.allSettled([
      service.rotateRefreshToken(input),
      service.rotateRefreshToken(input),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: expect.any(RefreshOperationAlreadyProcessedError),
    });
    expect(persistence.refreshTokens.size).toBe(2);
    expect(
      [...persistence.refreshTokens.values()].filter(
        (token) => token.consumedAt === null,
      ),
    ).toHaveLength(1);
    expect(persistence.sessions.get(created.sessionId)?.revokedAt).toBeNull();
  });

  it('revokes the family on suspicious reuse and logs no credential material', async () => {
    const { persistence, service } = makeService();
    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'wiki',
    });
    const rotated = await service.rotateRefreshToken({
      refreshToken: created.refreshToken,
      clientType: 'wiki',
      operationId: OPERATION_ID,
    });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    await expect(
      service.rotateRefreshToken({
        refreshToken: created.refreshToken,
        clientType: 'wiki',
        operationId: SECOND_OPERATION_ID,
      }),
    ).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);

    expect(
      persistence.sessions.get(created.sessionId)?.revokedAt,
    ).not.toBeNull();
    expect(
      [...persistence.refreshTokens.values()].every(
        (token) => token.consumedAt !== null,
      ),
    ).toBe(true);
    const warningText = warnSpy.mock.calls.flat().join(' ');
    expect(warningText).toContain('refresh_token_reuse');
    expect(warningText).not.toContain(created.refreshToken);
    expect(warningText).not.toContain(rotated.refreshToken);
    expect(warningText).not.toContain(OPERATION_ID);
    expect(warningText).not.toContain(
      digest(created.refreshToken).toString('hex'),
    );
  });

  it.each(['expired', 'revoked'] as const)(
    'rejects a refresh for a %s session without creating a successor',
    async (state) => {
      const { persistence, service } = makeService();
      const created = await service.createSession({
        userId: TEST_USER_ID,
        clientType: 'app',
      });
      const session = persistence.sessions.get(created.sessionId);
      if (session) {
        if (state === 'expired') {
          session.expiresAt = new Date(Date.now() - 1);
        } else {
          session.revokedAt = new Date();
        }
      }

      await expect(
        service.rotateRefreshToken({
          refreshToken: created.refreshToken,
          clientType: 'app',
          operationId: OPERATION_ID,
        }),
      ).rejects.toBeInstanceOf(InvalidSessionCredentialError);
      expect(persistence.refreshTokens.size).toBe(1);
    },
  );

  it('revokes an inactive owner session and refuses rotation', async () => {
    const { persistence, service } = makeService();
    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    persistence.users.set(TEST_USER_ID, { id: TEST_USER_ID, isActive: false });

    await expect(
      service.rotateRefreshToken({
        refreshToken: created.refreshToken,
        clientType: 'app',
        operationId: OPERATION_ID,
      }),
    ).rejects.toBeInstanceOf(InvalidSessionCredentialError);
    expect(
      persistence.sessions.get(created.sessionId)?.revokedAt,
    ).not.toBeNull();
    expect(
      [...persistence.refreshTokens.values()][0].consumedAt,
    ).not.toBeNull();
  });

  it('revokes only the requested owned session or all active user sessions', async () => {
    const { persistence, service } = makeService();
    const app = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    const wiki = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'wiki',
    });

    await expect(
      service.revokeSession({
        sessionId: app.sessionId,
        userId: 'different-user',
      }),
    ).resolves.toBe(false);
    await expect(
      service.revokeSession({
        sessionId: app.sessionId,
        userId: TEST_USER_ID,
        clientType: 'app',
      }),
    ).resolves.toBe(true);
    expect(persistence.sessions.get(app.sessionId)?.revokedAt).not.toBeNull();
    expect(persistence.sessions.get(wiki.sessionId)?.revokedAt).toBeNull();

    await expect(service.revokeAllSessionsForUser(TEST_USER_ID)).resolves.toBe(
      1,
    );
    expect(persistence.sessions.get(wiki.sessionId)?.revokedAt).not.toBeNull();
    expect(
      [...persistence.refreshTokens.values()].every(
        (token) => token.consumedAt !== null,
      ),
    ).toBe(true);
  });

  it('rolls back a partially attempted creation or rotation when persistence fails', async () => {
    const { persistence, service } = makeService();
    persistence.failNextRefreshInsert = true;
    await expect(
      service.createSession({ userId: TEST_USER_ID, clientType: 'app' }),
    ).rejects.toThrow('injected persistence failure');
    expect(persistence.sessions.size).toBe(0);
    expect(persistence.refreshTokens.size).toBe(0);

    const created = await service.createSession({
      userId: TEST_USER_ID,
      clientType: 'app',
    });
    persistence.failNextRefreshInsert = true;
    await expect(
      service.rotateRefreshToken({
        refreshToken: created.refreshToken,
        clientType: 'app',
        operationId: OPERATION_ID,
      }),
    ).rejects.toThrow('injected persistence failure');
    expect(persistence.refreshTokens.size).toBe(1);
    expect([...persistence.refreshTokens.values()][0].consumedAt).toBeNull();
    expect(persistence.sessions.get(created.sessionId)?.revokedAt).toBeNull();
  });
});
