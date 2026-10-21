import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { AuthRefreshToken } from '../entities/auth-refresh-token.entity';
import {
  AuthSession,
  SessionClientType,
} from '../entities/auth-session.entity';

export type UserSessionState = Pick<User, 'id' | 'isActive'>;

export type NewSessionRecord = {
  userId: string;
  clientType: SessionClientType;
  createdAt: Date;
  expiresAt: Date;
};

export type NewRefreshTokenRecord = {
  sessionId: string;
  tokenHash: Buffer;
  createdAt: Date;
};

export interface SessionsUnitOfWork {
  findUserState(
    userId: string,
    lockForSessionCreation: boolean,
  ): Promise<UserSessionState | null>;
  createSession(record: NewSessionRecord): Promise<AuthSession>;
  createRefreshToken(record: NewRefreshTokenRecord): Promise<AuthRefreshToken>;
  findRefreshTokenByHash(hash: Buffer): Promise<AuthRefreshToken | null>;
  lockSession(sessionId: string): Promise<AuthSession | null>;
  lockRefreshToken(refreshTokenId: string): Promise<AuthRefreshToken | null>;
  saveSession(session: AuthSession): Promise<AuthSession>;
  saveRefreshToken(token: AuthRefreshToken): Promise<AuthRefreshToken>;
  lockActiveSessionsForUser(userId: string): Promise<AuthSession[]>;
  invalidateActiveRefreshTokens(
    sessionIds: string[],
    consumedAt: Date,
  ): Promise<void>;
}

export interface SessionsPersistence {
  withTransaction<T>(
    operation: (unitOfWork: SessionsUnitOfWork) => Promise<T>,
  ): Promise<T>;
  purgeExpiredSessions(
    retentionCutoff: Date,
    tokenBatchSize: number,
    sessionBatchSize: number,
  ): Promise<{ refreshTokensDeleted: number; sessionsDeleted: number }>;
}

export const SESSIONS_PERSISTENCE = Symbol('SESSIONS_PERSISTENCE');

@Injectable()
export class TypeOrmSessionsPersistence implements SessionsPersistence {
  constructor(private readonly dataSource: DataSource) {}

  withTransaction<T>(
    operation: (unitOfWork: SessionsUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      operation(new TypeOrmSessionsUnitOfWork(manager)),
    );
  }

  purgeExpiredSessions(
    retentionCutoff: Date,
    tokenBatchSize: number,
    sessionBatchSize: number,
  ): Promise<{ refreshTokensDeleted: number; sessionsDeleted: number }> {
    return this.dataSource.transaction(async (manager) => {
      const lockedSessions = (await manager.query(
        `SELECT session.id
         FROM auth_sessions session
         WHERE session.revoked_at < $1
            OR (session.revoked_at IS NULL AND session.expires_at < $1)
         ORDER BY COALESCE(session.revoked_at, session.expires_at), session.id
         LIMIT $2
         FOR UPDATE OF session SKIP LOCKED`,
        [retentionCutoff, sessionBatchSize],
      )) as Array<{ id: string }>;
      const sessionIds = lockedSessions.map((session) => session.id);
      if (sessionIds.length === 0) {
        return { refreshTokensDeleted: 0, sessionsDeleted: 0 };
      }

      const lockedTokens = (await manager.query(
        `SELECT token.id
         FROM auth_refresh_tokens token
         WHERE token.session_id = ANY($1::uuid[])
         ORDER BY token.id
         LIMIT $2
         FOR UPDATE OF token SKIP LOCKED`,
        [sessionIds, tokenBatchSize],
      )) as Array<{ id: string }>;
      const tokenIds = lockedTokens.map((token) => token.id);
      const deletedTokenCount = tokenIds.length
        ? ((
            (await manager.query(
              `WITH deleted AS (
               DELETE FROM auth_refresh_tokens token
               WHERE token.id = ANY($1::uuid[])
               RETURNING token.id
             )
             SELECT count(*)::int AS count FROM deleted`,
              [tokenIds],
            )) as Array<{ count: number }>
          )[0]?.count ?? 0)
        : 0;

      const deletedSessionCount = (await manager.query(
        `WITH deleted AS (
           DELETE FROM auth_sessions session
           WHERE session.id = ANY($1::uuid[])
             AND NOT EXISTS (
               SELECT 1 FROM auth_refresh_tokens token
               WHERE token.session_id = session.id
             )
           RETURNING session.id
         )
         SELECT count(*)::int AS count FROM deleted`,
        [sessionIds],
      )) as Array<{ count: number }>;

      return {
        refreshTokensDeleted: deletedTokenCount,
        sessionsDeleted: deletedSessionCount[0]?.count ?? 0,
      };
    });
  }
}

class TypeOrmSessionsUnitOfWork implements SessionsUnitOfWork {
  constructor(private readonly manager: EntityManager) {}

  findUserState(
    userId: string,
    lockForSessionCreation: boolean,
  ): Promise<UserSessionState | null> {
    return this.manager.getRepository(User).findOne({
      where: { id: userId },
      select: { id: true, isActive: true },
      ...(lockForSessionCreation
        ? { lock: { mode: 'pessimistic_read' as const } }
        : {}),
    });
  }

  createSession(record: NewSessionRecord): Promise<AuthSession> {
    const sessionRepository = this.manager.getRepository(AuthSession);
    return sessionRepository.save(
      sessionRepository.create({
        user: { id: record.userId },
        clientType: record.clientType,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        lastActivityAt: record.createdAt,
      }),
    );
  }

  createRefreshToken(record: NewRefreshTokenRecord): Promise<AuthRefreshToken> {
    const refreshRepository = this.manager.getRepository(AuthRefreshToken);
    return refreshRepository.save(
      refreshRepository.create({
        session: { id: record.sessionId },
        tokenHash: record.tokenHash,
        createdAt: record.createdAt,
        consumedAt: null,
        operationKeyHash: null,
      }),
    );
  }

  findRefreshTokenByHash(hash: Buffer): Promise<AuthRefreshToken | null> {
    return this.manager.getRepository(AuthRefreshToken).findOne({
      where: { tokenHash: hash },
      relations: { session: true },
    });
  }

  lockSession(sessionId: string): Promise<AuthSession | null> {
    return this.manager.getRepository(AuthSession).findOne({
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  lockRefreshToken(refreshTokenId: string): Promise<AuthRefreshToken | null> {
    return this.manager.getRepository(AuthRefreshToken).findOne({
      where: { id: refreshTokenId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  saveSession(session: AuthSession): Promise<AuthSession> {
    return this.manager.getRepository(AuthSession).save(session);
  }

  saveRefreshToken(token: AuthRefreshToken): Promise<AuthRefreshToken> {
    return this.manager.getRepository(AuthRefreshToken).save(token);
  }

  lockActiveSessionsForUser(userId: string): Promise<AuthSession[]> {
    return this.manager.getRepository(AuthSession).find({
      where: { user: { id: userId }, revokedAt: IsNull() },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write', tables: ['auth_sessions'] },
    });
  }

  async invalidateActiveRefreshTokens(
    sessionIds: string[],
    consumedAt: Date,
  ): Promise<void> {
    if (sessionIds.length === 0) return;

    await this.manager
      .getRepository(AuthRefreshToken)
      .createQueryBuilder()
      .update(AuthRefreshToken)
      .set({ consumedAt })
      .where('"session_id" IN (:...sessionIds)', { sessionIds })
      .andWhere('"consumed_at" IS NULL')
      .execute();
  }
}
