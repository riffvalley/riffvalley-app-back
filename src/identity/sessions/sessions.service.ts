import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthSession, SessionClientType } from './entities/auth-session.entity';
import {
  InvalidSessionClientError,
  InvalidSessionCredentialError,
  RefreshOperationAlreadyProcessedError,
  RefreshTokenReuseDetectedError,
  SessionOwnerUnavailableError,
} from './errors/sessions.errors';
import {
  NewRefreshTokenRecord,
  NewSessionRecord,
  SESSIONS_PERSISTENCE,
  SessionsPersistence,
} from './persistence/sessions.persistence';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const OPERATION_RETRY_WINDOW_MS = 2 * 60 * 1000;
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_TOKEN_BATCH_SIZE = 250;
const CLEANUP_SESSION_BATCH_SIZE = 100;
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateSessionInput = {
  userId: string;
  clientType: unknown;
};

export type RotateRefreshTokenInput = {
  refreshToken: string;
  clientType: unknown;
  operationId: string;
};

export type RevokeSessionInput = {
  sessionId: string;
  userId: string;
  clientType?: unknown;
};

export type SessionCredential = {
  sessionId: string;
  userId: string;
  clientType: SessionClientType;
  createdAt: Date;
  expiresAt: Date;
  refreshToken: string;
};

type RotationOutcome =
  | { kind: 'rotated'; credential: SessionCredential }
  | { kind: 'invalid' }
  | {
      kind: 'processed';
      sessionId: string;
      userId: string;
      clientType: SessionClientType;
    }
  | {
      kind: 'expired';
      sessionId: string;
      userId: string;
      clientType: SessionClientType;
    }
  | {
      kind: 'reuse';
      sessionId: string;
      userId: string;
      clientType: SessionClientType;
    };

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private lastCleanupAt = 0;

  constructor(
    @Inject(SESSIONS_PERSISTENCE)
    private readonly persistence: SessionsPersistence,
  ) {}

  async createSession(input: CreateSessionInput): Promise<SessionCredential> {
    const clientType = input.clientType;
    if (!this.isClientType(clientType)) {
      throw new InvalidSessionClientError();
    }

    const credential = await this.persistence.withTransaction(
      async (unitOfWork) => {
        const owner = await unitOfWork.findUserState(input.userId, true);
        if (!owner?.isActive) throw new SessionOwnerUnavailableError();

        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
        const sessionRecord: NewSessionRecord = {
          userId: owner.id,
          clientType,
          createdAt,
          expiresAt,
        };
        const session = await unitOfWork.createSession(sessionRecord);
        const refreshToken = this.generateRefreshToken();
        const refreshRecord: NewRefreshTokenRecord = {
          sessionId: session.id,
          tokenHash: this.hash(refreshToken),
          createdAt,
        };
        await unitOfWork.createRefreshToken(refreshRecord);

        return this.toCredential(session, owner.id, refreshToken);
      },
    );

    this.logger.log(
      `security_event=session_created session_id=${credential.sessionId} user_id=${credential.userId} client_type=${credential.clientType}`,
    );
    await this.cleanupExpiredSessionsIfDue();
    return credential;
  }

  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<SessionCredential> {
    const clientType = input.clientType;
    if (
      !this.isClientType(clientType) ||
      !REFRESH_TOKEN_PATTERN.test(input.refreshToken) ||
      !OPERATION_ID_PATTERN.test(input.operationId)
    ) {
      throw new InvalidSessionCredentialError();
    }

    const presentedHash = this.hash(input.refreshToken);
    const operationKeyHash = this.hash(input.operationId);
    const outcome = await this.persistence.withTransaction(
      async (unitOfWork): Promise<RotationOutcome> => {
        const tokenLocation =
          await unitOfWork.findRefreshTokenByHash(presentedHash);
        if (!tokenLocation) return { kind: 'invalid' };

        // Acquire locks in a stable order: session first, then refresh row.
        const session = await unitOfWork.lockSession(tokenLocation.sessionId);
        if (!session) return { kind: 'invalid' };
        const refreshToken = await unitOfWork.lockRefreshToken(
          tokenLocation.id,
        );
        if (
          !refreshToken ||
          !this.equalHashes(refreshToken.tokenHash, presentedHash) ||
          refreshToken.sessionId !== session.id
        ) {
          return { kind: 'invalid' };
        }

        const now = new Date();
        if (
          session.clientType !== clientType ||
          session.revokedAt !== null ||
          session.expiresAt.getTime() <= now.getTime()
        ) {
          if (
            session.clientType === clientType &&
            session.revokedAt === null &&
            session.expiresAt.getTime() <= now.getTime()
          ) {
            return {
              kind: 'expired',
              sessionId: session.id,
              userId: session.userId,
              clientType: session.clientType,
            };
          }
          return { kind: 'invalid' };
        }

        const owner = await unitOfWork.findUserState(session.userId, false);
        if (!owner?.isActive) {
          session.revokedAt = now;
          await unitOfWork.saveSession(session);
          await unitOfWork.invalidateActiveRefreshTokens([session.id], now);
          return { kind: 'invalid' };
        }

        if (refreshToken.consumedAt !== null) {
          if (
            this.isWithinRetryWindow(refreshToken.consumedAt, now) &&
            this.equalHashes(refreshToken.operationKeyHash, operationKeyHash)
          ) {
            return {
              kind: 'processed',
              sessionId: session.id,
              userId: owner.id,
              clientType: session.clientType,
            };
          }

          session.revokedAt = now;
          await unitOfWork.saveSession(session);
          await unitOfWork.invalidateActiveRefreshTokens([session.id], now);
          return {
            kind: 'reuse',
            sessionId: session.id,
            userId: owner.id,
            clientType: session.clientType,
          };
        }

        if (refreshToken.replacedById !== null) {
          session.revokedAt = now;
          await unitOfWork.saveSession(session);
          await unitOfWork.invalidateActiveRefreshTokens([session.id], now);
          return {
            kind: 'reuse',
            sessionId: session.id,
            userId: owner.id,
            clientType: session.clientType,
          };
        }

        const successorValue = this.generateRefreshToken();
        refreshToken.consumedAt = now;
        refreshToken.operationKeyHash = operationKeyHash;
        await unitOfWork.saveRefreshToken(refreshToken);

        const successor = await unitOfWork.createRefreshToken({
          sessionId: session.id,
          tokenHash: this.hash(successorValue),
          createdAt: now,
        });
        refreshToken.replacedBy = successor;
        await unitOfWork.saveRefreshToken(refreshToken);

        session.lastActivityAt = now;
        await unitOfWork.saveSession(session);

        return {
          kind: 'rotated',
          credential: this.toCredential(session, owner.id, successorValue),
        };
      },
    );

    if (outcome.kind === 'processed') {
      this.logger.warn(
        `security_event=refresh_operation_conflict session_id=${outcome.sessionId} user_id=${outcome.userId} client_type=${outcome.clientType}`,
      );
      throw new RefreshOperationAlreadyProcessedError();
    }
    if (outcome.kind === 'expired') {
      this.logger.warn(
        `security_event=session_expired session_id=${outcome.sessionId} user_id=${outcome.userId} client_type=${outcome.clientType}`,
      );
      throw new InvalidSessionCredentialError();
    }
    if (outcome.kind === 'reuse') {
      this.logger.warn(
        `security_event=refresh_token_reuse session_id=${outcome.sessionId} user_id=${outcome.userId} client_type=${outcome.clientType}`,
      );
      throw new RefreshTokenReuseDetectedError();
    }
    if (outcome.kind === 'rotated') {
      this.logger.log(
        `security_event=refresh_rotated session_id=${outcome.credential.sessionId} user_id=${outcome.credential.userId} client_type=${outcome.credential.clientType}`,
      );
      await this.cleanupExpiredSessionsIfDue();
    }
    if (outcome.kind === 'invalid') {
      throw new InvalidSessionCredentialError();
    }
    return outcome.credential;
  }

  async revokeSession(input: RevokeSessionInput): Promise<boolean> {
    const clientType = input.clientType;
    if (clientType !== undefined && !this.isClientType(clientType)) {
      throw new InvalidSessionClientError();
    }

    const revoked = await this.persistence.withTransaction(
      async (unitOfWork) => {
        const session = await unitOfWork.lockSession(input.sessionId);
        if (
          !session ||
          session.userId !== input.userId ||
          (clientType !== undefined && session.clientType !== clientType)
        ) {
          return false;
        }

        const now = new Date();
        const changed = session.revokedAt === null;
        if (changed) {
          session.revokedAt = now;
          await unitOfWork.saveSession(session);
        }
        await unitOfWork.invalidateActiveRefreshTokens([session.id], now);
        return { changed, clientType: session.clientType };
      },
    );
    if (revoked && revoked.changed) {
      this.logger.log(
        `security_event=session_revoked session_id=${input.sessionId} user_id=${input.userId} client_type=${revoked.clientType}`,
      );
    }
    return revoked !== false;
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    const count = await this.persistence.withTransaction(async (unitOfWork) => {
      const sessions = await unitOfWork.lockActiveSessionsForUser(userId);
      if (sessions.length === 0) return 0;

      const now = new Date();
      for (const session of sessions) {
        session.revokedAt = now;
        await unitOfWork.saveSession(session);
      }
      await unitOfWork.invalidateActiveRefreshTokens(
        sessions.map((session) => session.id),
        now,
      );
      return sessions.length;
    });
    if (count > 0) {
      this.logger.log(
        `security_event=user_sessions_revoked user_id=${userId} session_count=${count}`,
      );
    }
    return count;
  }

  private async cleanupExpiredSessionsIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;

    try {
      const result = await this.persistence.purgeExpiredSessions(
        new Date(now - SESSION_RETENTION_MS),
        CLEANUP_TOKEN_BATCH_SIZE,
        CLEANUP_SESSION_BATCH_SIZE,
      );
      this.lastCleanupAt = now;
      if (result.refreshTokensDeleted > 0 || result.sessionsDeleted > 0) {
        this.logger.log(
          `security_event=session_cleanup refresh_tokens=${result.refreshTokensDeleted} sessions=${result.sessionsDeleted}`,
        );
      }
    } catch {
      this.logger.warn('security_event=session_cleanup_failed');
    }
  }

  private toCredential(
    session: AuthSession,
    userId: string,
    refreshToken: string,
  ): SessionCredential {
    return {
      sessionId: session.id,
      userId,
      clientType: session.clientType,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      refreshToken,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private hash(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
  }

  private equalHashes(left: Buffer | null, right: Buffer): boolean {
    return (
      left !== null &&
      left.length === right.length &&
      timingSafeEqual(left, right)
    );
  }

  private isWithinRetryWindow(consumedAt: Date, now: Date): boolean {
    const age = now.getTime() - consumedAt.getTime();
    return age >= 0 && age <= OPERATION_RETRY_WINDOW_MS;
  }

  private isClientType(value: unknown): value is SessionClientType {
    return value === 'app' || value === 'wiki';
  }
}
