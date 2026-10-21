import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuthRateLimitDimension } from './auth-rate-limit-policy';

type RateLimitResult = {
  scope: string;
  attempt_count: number;
  attempt_limit: number;
  retry_after_seconds: number;
};

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_BATCH_SIZE = 500;
const RETENTION_WINDOWS = 2;

export const AUTH_RATE_LIMIT_INCREMENT_SQL = `
  WITH requested AS (
    SELECT scope, subject_hash, attempt_limit, window_seconds
    FROM unnest($1::text[], $2::bytea[], $3::integer[], $4::integer[])
      AS input(scope, subject_hash, attempt_limit, window_seconds)
  ), bucketed AS (
    SELECT scope, subject_hash, attempt_limit, window_seconds,
           date_bin(
             make_interval(secs => window_seconds),
             clock_timestamp(),
             TIMESTAMPTZ 'epoch'
           ) AS window_started_at
    FROM requested
  ), incremented AS (
    INSERT INTO auth_rate_limit_windows
      (scope, subject_hash, window_started_at, attempt_count, expires_at)
    SELECT scope, subject_hash, window_started_at, 1,
           window_started_at + make_interval(secs => window_seconds * $5::integer)
    FROM bucketed
    ON CONFLICT (scope, subject_hash, window_started_at)
    DO UPDATE SET
      attempt_count = auth_rate_limit_windows.attempt_count + 1,
      expires_at = EXCLUDED.expires_at
    RETURNING scope, subject_hash, window_started_at, attempt_count
  )
  SELECT incremented.scope,
         incremented.attempt_count,
         bucketed.attempt_limit,
         GREATEST(
           1,
           CEIL(EXTRACT(EPOCH FROM (
             incremented.window_started_at
             + make_interval(secs => bucketed.window_seconds)
             - clock_timestamp()
           )))::integer
         ) AS retry_after_seconds
  FROM incremented
  JOIN bucketed USING (scope, subject_hash, window_started_at)
`;

@Injectable()
export class AuthRateLimitService {
  private static lastCleanupAt = 0;
  private readonly logger = new Logger(AuthRateLimitService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async consume(
    dimensions: readonly AuthRateLimitDimension[],
  ): Promise<number | null> {
    if (dimensions.length === 0) return null;

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Authentication controls are unavailable',
      );
    }

    const rows = dimensions.map((dimension) => ({
      ...dimension,
      subjectHash: this.hashSubject(secret, dimension.scope, dimension.subject),
    }));

    let results: RateLimitResult[];
    try {
      results = (await this.dataSource.query(AUTH_RATE_LIMIT_INCREMENT_SQL, [
        rows.map((row) => row.scope),
        rows.map((row) => row.subjectHash),
        rows.map((row) => row.limit),
        rows.map((row) => row.windowSeconds),
        RETENTION_WINDOWS,
      ])) as RateLimitResult[];
    } catch {
      throw new ServiceUnavailableException(
        'Authentication controls are unavailable',
      );
    }

    void this.cleanupExpiredRows();

    const exceeded = results.filter(
      (row) => row.attempt_count > row.attempt_limit,
    );
    return exceeded.length
      ? Math.max(...exceeded.map((row) => Number(row.retry_after_seconds)))
      : null;
  }

  private hashSubject(secret: string, scope: string, subject: string): Buffer {
    const key = createHmac('sha256', secret)
      .update('riffvalley:auth-rate-limit:key:v1')
      .digest();
    return createHmac('sha256', key)
      .update(scope)
      .update('\0')
      .update(subject)
      .digest();
  }

  private async cleanupExpiredRows(): Promise<void> {
    const now = Date.now();
    if (now - AuthRateLimitService.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    AuthRateLimitService.lastCleanupAt = now;

    try {
      await this.dataSource.query(
        `WITH expired AS (
           SELECT ctid
           FROM auth_rate_limit_windows
           WHERE expires_at <= clock_timestamp()
           ORDER BY expires_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         DELETE FROM auth_rate_limit_windows AS bucket
         USING expired
         WHERE bucket.ctid = expired.ctid`,
        [CLEANUP_BATCH_SIZE],
      );
    } catch {
      this.logger.warn('security_event=auth_rate_limit_cleanup_failed');
    }
  }
}
