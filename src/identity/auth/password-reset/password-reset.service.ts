import {
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { SessionsService } from '../../sessions/sessions.service';
import { PasswordResetRequestStatus } from './entities/password-reset-request.entity';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RESET_LIFETIME_MS = 30 * 60 * 1000;
const TOKEN_NAMESPACE = 'riffvalley:auth-password-reset:v1:';
const SECRET_CONFIG_KEY = 'AUTH_PASSWORD_RESET_TOKEN_SECRET';

type ResetRequestLocation = {
  id: string;
  user_id: string;
};

type LockedResetRequest = ResetRequestLocation & {
  token_hash: Buffer;
  status: PasswordResetRequestStatus;
  expires_at: Date | null;
};

export type PasswordResetRequestCreated = {
  requestId: string;
};

export type PasswordResetDelivery = {
  requestId: string;
  email: string;
  token: string;
};

export type PasswordResetClaim = {
  requestId: string;
  attemptCount: number;
  lockedUntil: Date;
};

export function derivePasswordResetToken(
  requestId: string,
  secret: Buffer,
): string {
  return createHmac('sha256', secret)
    .update(TOKEN_NAMESPACE)
    .update(requestId)
    .digest('base64url');
}

export function hashPasswordResetToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @Inject(SessionsService)
    private readonly sessionsService: Pick<
      SessionsService,
      'revokeAllSessionsForUserInTransaction'
    >,
  ) {}

  /** Creates a durable but unusable request for the SMTP outbox worker. */
  async createPendingRequest(
    userId: string,
  ): Promise<PasswordResetRequestCreated | null> {
    const secret = this.readSecret();
    const requestId = randomUUID();
    const outboxId = randomUUID();
    const tokenHash = hashPasswordResetToken(
      derivePasswordResetToken(requestId, secret),
    );

    const created = await this.dataSource.transaction(async (manager) => {
      const owner = await this.usersService.lockPasswordResetOwner(
        userId,
        manager,
      );
      if (!owner?.isActive) return false;

      await manager.query(
        `UPDATE auth_password_reset_requests
         SET status = 'invalidated', invalidated_at = clock_timestamp()
         WHERE user_id = $1 AND status IN ('pending_delivery', 'active')`,
        [userId],
      );
      await manager.query(
        `UPDATE auth_password_reset_outbox
         SET status = 'cancelled', locked_until = NULL
         WHERE request_id IN (
           SELECT id FROM auth_password_reset_requests WHERE user_id = $1
         ) AND status IN ('queued', 'leased')`,
        [userId],
      );
      await manager.query(
        `INSERT INTO auth_password_reset_requests
           (id, user_id, token_hash, status)
         VALUES ($1, $2, $3, 'pending_delivery')`,
        [requestId, userId, tokenHash],
      );
      await manager.query(
        `INSERT INTO auth_password_reset_outbox (id, request_id, status, attempt_count)
         VALUES ($1, $2, 'queued', 0)`,
        [outboxId, requestId],
      );
      return true;
    });

    return created ? { requestId } : null;
  }

  assertConfigured(): void {
    this.readSecret();
  }

  /** Reconstructs the plaintext only in memory for the outbox worker. */
  async deriveTokenForDelivery(requestId: string): Promise<string> {
    const token = derivePasswordResetToken(requestId, this.readSecret());
    const rows = (await this.dataSource.query(
      `SELECT token_hash FROM auth_password_reset_requests
       WHERE id = $1 AND status = 'pending_delivery'`,
      [requestId],
    )) as Array<{ token_hash: Buffer }>;
    const storedHash = rows[0]?.token_hash;
    const derivedHash = hashPasswordResetToken(token);
    if (
      !storedHash ||
      storedHash.length !== derivedHash.length ||
      !timingSafeEqual(storedHash, derivedHash)
    ) {
      throw this.unavailable();
    }
    return token;
  }

  async claimPendingDeliveries(
    batchSize: number,
    leaseSeconds: number,
    maxAttempts: number,
  ): Promise<PasswordResetClaim[]> {
    const rows = (await this.dataSource.query(
      `WITH candidates AS (
         SELECT outbox.id
         FROM auth_password_reset_outbox AS outbox
         JOIN auth_password_reset_requests AS request
           ON request.id = outbox.request_id
         WHERE request.status = 'pending_delivery'
           AND outbox.attempt_count < $3
           AND (
             (outbox.status = 'queued' AND outbox.available_at <= clock_timestamp())
             OR (outbox.status = 'leased' AND outbox.locked_until <= clock_timestamp())
           )
         ORDER BY outbox.available_at, outbox.created_at
         FOR UPDATE OF outbox SKIP LOCKED
         LIMIT $1
       ), claimed AS (
         UPDATE auth_password_reset_outbox AS outbox
         SET status = 'leased',
             attempt_count = outbox.attempt_count + 1,
             locked_until = date_trunc('milliseconds', clock_timestamp())
               + ($2 * INTERVAL '1 second')
         FROM candidates
         WHERE outbox.id = candidates.id
         RETURNING outbox.request_id, outbox.attempt_count, outbox.locked_until
       )
       SELECT request_id, attempt_count, locked_until FROM claimed`,
      [batchSize, leaseSeconds, maxAttempts],
    )) as Array<{
      request_id: string;
      attempt_count: number;
      locked_until: Date;
    }>;
    return rows.map(({ request_id, attempt_count, locked_until }) => ({
      requestId: request_id,
      attemptCount: attempt_count,
      lockedUntil: locked_until,
    }));
  }

  async failExhaustedDeliveries(
    maxAttempts: number,
    batchSize: number,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT outbox.request_id
       FROM auth_password_reset_outbox AS outbox
       JOIN auth_password_reset_requests AS request
         ON request.id = outbox.request_id
       WHERE request.status = 'pending_delivery'
         AND outbox.attempt_count >= $1
         AND (outbox.status = 'queued' OR
              (outbox.status = 'leased' AND outbox.locked_until <= clock_timestamp()))
       ORDER BY outbox.available_at
       LIMIT $2`,
      [maxAttempts, batchSize],
    )) as Array<{ request_id: string }>;
    for (const row of rows) await this.failPendingDelivery(row.request_id);
  }

  async cleanupTerminalRequests(
    retentionDays: number,
    batchSize: number,
  ): Promise<number> {
    const rows = (await this.dataSource.query(
      `WITH stale AS (
         SELECT id
         FROM auth_password_reset_requests
         WHERE (
           status IN ('consumed', 'invalidated', 'failed')
           AND requested_at < clock_timestamp() - ($1 * INTERVAL '1 day')
         ) OR (
           status = 'active'
           AND expires_at <= clock_timestamp() - ($1 * INTERVAL '1 day')
         )
         ORDER BY requested_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       ), deleted AS (
         DELETE FROM auth_password_reset_requests AS request
         USING stale WHERE request.id = stale.id
         RETURNING request.id
       )
       SELECT COUNT(*)::integer AS deleted_count FROM deleted`,
      [retentionDays, batchSize],
    )) as Array<{ deleted_count: number }>;
    return Number(rows[0]?.deleted_count ?? 0);
  }

  async getClaimedDelivery(
    requestId: string,
    lockedUntil: Date,
  ): Promise<PasswordResetDelivery | null> {
    const rows = (await this.dataSource.query(
      `SELECT request.id AS request_id, users.email
       FROM auth_password_reset_requests AS request
       JOIN auth_password_reset_outbox AS outbox
         ON outbox.request_id = request.id
       JOIN users ON users.id = request.user_id
       WHERE request.id = $1 AND request.status = 'pending_delivery'
         AND users."isActive" = true AND outbox.status = 'leased'
         AND outbox.locked_until = $2
         AND outbox.locked_until > clock_timestamp()`,
      [requestId, lockedUntil],
    )) as Array<{ request_id: string; email: string }>;
    const delivery = rows[0];
    if (!delivery?.email) return null;

    return {
      requestId: delivery.request_id,
      email: delivery.email,
      token: await this.deriveTokenForDelivery(delivery.request_id),
    };
  }

  async retryPendingDelivery(
    requestId: string,
    delaySeconds: number,
    maxAttempts: number,
    lockedUntil: Date,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `WITH rescheduled AS (
         UPDATE auth_password_reset_outbox
         SET status = 'queued',
             available_at = clock_timestamp() + ($2 * INTERVAL '1 second'),
             locked_until = NULL
         WHERE request_id = $1 AND status = 'leased' AND locked_until = $3
         RETURNING attempt_count
       )
       SELECT attempt_count FROM rescheduled`,
      [requestId, delaySeconds, lockedUntil],
    )) as Array<{ attempt_count: number }>;
    const attemptCount = rows[0]?.attempt_count;
    if (attemptCount !== undefined && attemptCount >= maxAttempts) {
      await this.failPendingDelivery(requestId);
    }
  }

  /** Called only after SMTP accepts the message. */
  async activateDeliveredRequest(requestId: string): Promise<boolean> {
    const lookup = (await this.dataSource.query(
      `SELECT user_id FROM auth_password_reset_requests WHERE id = $1`,
      [requestId],
    )) as Array<{ user_id: string }>;
    const userId = lookup[0]?.user_id;
    if (!userId) return false;

    return this.dataSource.transaction(async (manager) => {
      const owner = await this.usersService.lockPasswordResetOwner(
        userId,
        manager,
      );
      const requests = (await manager.query(
        `SELECT id, user_id, token_hash, status, expires_at
         FROM auth_password_reset_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      )) as LockedResetRequest[];
      const request = requests[0];
      if (
        !owner?.isActive ||
        !request ||
        request.user_id !== userId ||
        request.status !== 'pending_delivery'
      ) {
        return false;
      }

      await manager.query(
        `WITH activation AS (
           SELECT clock_timestamp() AS activated_at
         )
         UPDATE auth_password_reset_requests AS request
         SET status = 'active',
             activated_at = activation.activated_at,
             expires_at = activation.activated_at + ($2 * INTERVAL '1 millisecond')
         FROM activation
         WHERE request.id = $1 AND request.status = 'pending_delivery'`,
        [requestId, RESET_LIFETIME_MS],
      );
      const activeRows = (await manager.query(
        `SELECT status, activated_at, expires_at
         FROM auth_password_reset_requests WHERE id = $1`,
        [requestId],
      )) as Array<{
        status: PasswordResetRequestStatus;
        activated_at: Date | null;
        expires_at: Date | null;
      }>;
      const active = activeRows[0];
      if (
        active?.status !== 'active' ||
        !active.activated_at ||
        !active.expires_at
      ) {
        return false;
      }

      await manager.query(
        `UPDATE auth_password_reset_outbox
         SET status = 'delivered', delivered_at = clock_timestamp(), locked_until = NULL
         WHERE request_id = $1 AND status IN ('queued', 'leased')`,
        [requestId],
      );
      const deliveredRows = (await manager.query(
        'SELECT status FROM auth_password_reset_outbox WHERE request_id = $1',
        [requestId],
      )) as Array<{ status: string }>;
      if (deliveredRows[0]?.status !== 'delivered') {
        throw new Error('Password reset delivery state is unavailable');
      }
      return true;
    });
  }

  /** Marks a terminal delivery failure without making its reset token usable. */
  async failPendingDelivery(requestId: string): Promise<boolean> {
    const lookup = (await this.dataSource.query(
      `SELECT user_id FROM auth_password_reset_requests WHERE id = $1`,
      [requestId],
    )) as Array<{ user_id: string }>;
    const userId = lookup[0]?.user_id;
    if (!userId) return false;

    return this.dataSource.transaction(async (manager) => {
      await this.usersService.lockPasswordResetOwner(userId, manager);
      await manager.query(
        `UPDATE auth_password_reset_requests
         SET status = 'failed', invalidated_at = clock_timestamp()
         WHERE id = $1 AND status = 'pending_delivery'`,
        [requestId],
      );
      const failedRows = (await manager.query(
        'SELECT status FROM auth_password_reset_requests WHERE id = $1',
        [requestId],
      )) as Array<{ status: string }>;
      if (failedRows[0]?.status !== 'failed') return false;

      await manager.query(
        `UPDATE auth_password_reset_outbox
         SET status = 'failed', failed_at = clock_timestamp(), locked_until = NULL
         WHERE request_id = $1 AND status IN ('queued', 'leased')`,
        [requestId],
      );
      const outboxRows = (await manager.query(
        'SELECT status FROM auth_password_reset_outbox WHERE request_id = $1',
        [requestId],
      )) as Array<{ status: string }>;
      if (outboxRows[0]?.status !== 'failed') {
        throw new Error('Password reset outbox state is unavailable');
      }
      return true;
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) throw this.invalidToken();

    const tokenHash = hashPasswordResetToken(token);
    const locations = (await this.dataSource.query(
      `SELECT id, user_id
       FROM auth_password_reset_requests
       WHERE token_hash = $1 AND status = 'active'
         AND expires_at > clock_timestamp()`,
      [tokenHash],
    )) as ResetRequestLocation[];
    const location = locations[0];
    if (!location) throw this.invalidToken();

    const passwordHash = this.usersService.hashPasswordForReset(password);
    const revokedSessions = await this.dataSource.transaction(
      async (manager) => {
        const owner = await this.usersService.lockPasswordResetOwner(
          location.user_id,
          manager,
        );
        if (!owner?.isActive) throw this.invalidToken();

        const requests = (await manager.query(
          `SELECT id, user_id, token_hash, status, expires_at
           FROM auth_password_reset_requests
           WHERE id = $1 AND expires_at > clock_timestamp() FOR UPDATE`,
          [location.id],
        )) as LockedResetRequest[];
        const request = requests[0];
        if (
          !request ||
          request.user_id !== location.user_id ||
          request.status !== 'active' ||
          !request.expires_at ||
          request.token_hash.length !== tokenHash.length ||
          !timingSafeEqual(request.token_hash, tokenHash)
        ) {
          throw this.invalidToken();
        }

        await this.usersService.changePasswordForResetInTransaction(
          location.user_id,
          passwordHash,
          manager,
        );
        await manager.query(
          `UPDATE auth_password_reset_requests
           SET status = 'consumed', consumed_at = clock_timestamp()
           WHERE id = $1`,
          [location.id],
        );
        await manager.query(
          `UPDATE auth_password_reset_requests
           SET status = 'invalidated', invalidated_at = clock_timestamp()
           WHERE user_id = $1 AND id <> $2
             AND status IN ('pending_delivery', 'active')`,
          [location.user_id, location.id],
        );
        await manager.query(
          `UPDATE auth_password_reset_outbox
           SET status = 'cancelled', locked_until = NULL
           WHERE request_id IN (
             SELECT id FROM auth_password_reset_requests
             WHERE user_id = $1 AND id <> $2
           ) AND status IN ('queued', 'leased')`,
          [location.user_id, location.id],
        );
        return this.sessionsService.revokeAllSessionsForUserInTransaction(
          location.user_id,
          manager,
        );
      },
    );

    this.logger.log(
      `security_event=password_reset_completed user_id=${location.user_id} revoked_sessions=${revokedSessions}`,
    );
  }

  private readSecret(): Buffer {
    const configuredSecret = this.configService.get<string>(SECRET_CONFIG_KEY);
    if (!configuredSecret) throw this.unavailable();
    const secret = Buffer.from(configuredSecret, 'base64url');
    if (
      secret.length !== 32 ||
      secret.toString('base64url') !== configuredSecret
    ) {
      throw this.unavailable();
    }
    return secret;
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('Password reset is not available');
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException('Password reset token is not valid');
  }
}
