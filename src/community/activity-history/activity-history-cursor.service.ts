import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ActivityHistoryContinuation,
  ActivityHistoryFilters,
} from './types/activity-history.types';

const CURSOR_VERSION = 1;
const CURSOR_LIFETIME_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;

interface CursorPayload {
  v: number;
  sub: string;
  filters: string;
  limit: number;
  position: ActivityHistoryContinuation;
  issuedAt: number;
  expiresAt: number;
}

@Injectable()
export class ActivityHistoryCursorService {
  constructor(private readonly configService: ConfigService) {}

  create(
    userId: string,
    filters: ActivityHistoryFilters,
    limit: number,
    position: ActivityHistoryContinuation,
    now = Date.now(),
  ): string {
    if (!isContinuation(position)) throw invalidCursor();
    const payload: CursorPayload = {
      v: CURSOR_VERSION,
      sub: userId,
      filters: this.fingerprint(filters),
      limit,
      position,
      issuedAt: now,
      expiresAt: now + CURSOR_LIFETIME_MS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.sign(encodedPayload).toString('base64url');
    return `${encodedPayload}.${signature}`;
  }

  verify(
    cursor: string,
    userId: string,
    filters: ActivityHistoryFilters,
    limit: number,
    now = Date.now(),
  ): ActivityHistoryContinuation {
    if (
      cursor.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(cursor)
    ) {
      throw invalidCursor();
    }
    const [encodedPayload, encodedSignature] = cursor.split('.');
    let signature: Buffer;
    try {
      signature = Buffer.from(encodedSignature, 'base64url');
    } catch {
      throw invalidCursor();
    }
    const expectedSignature = this.sign(encodedPayload);
    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature) ||
      signature.toString('base64url') !== encodedSignature
    ) {
      throw invalidCursor();
    }

    let parsed: unknown;
    try {
      const decoded = Buffer.from(encodedPayload, 'base64url');
      if (decoded.toString('base64url') !== encodedPayload) {
        throw invalidCursor();
      }
      parsed = JSON.parse(decoded.toString('utf8')) as unknown;
    } catch {
      throw invalidCursor();
    }
    if (!isCursorPayload(parsed)) throw invalidCursor();

    const payload = parsed;
    if (
      payload.v !== CURSOR_VERSION ||
      payload.sub !== userId ||
      payload.filters !== this.fingerprint(filters) ||
      payload.limit !== limit ||
      payload.issuedAt > now + 60_000 ||
      payload.expiresAt !== payload.issuedAt + CURSOR_LIFETIME_MS ||
      payload.expiresAt <= now ||
      !isContinuation(payload.position)
    ) {
      throw invalidCursor();
    }
    return payload.position;
  }

  private fingerprint(filters: ActivityHistoryFilters): string {
    const canonical = JSON.stringify({
      from: filters.from ?? null,
      to: filters.to ?? null,
      timeZone: filters.timeZone ?? null,
      type: filters.type ?? null,
      q: filters.query ?? null,
    });
    return createHash('sha256').update(canonical).digest('base64url');
  }

  private sign(payload: string): Buffer {
    const configuredSecret = this.configService.get<string>('JWT_SECRET');
    if (
      !configuredSecret ||
      configuredSecret.length < 32 ||
      configuredSecret === 'your_long_random_jwt_secret'
    ) {
      throw new Error(
        'Activity history cursor signing requires a configured secure JWT_SECRET.',
      );
    }
    const key = createHmac('sha256', configuredSecret)
      .update('riffvalley:activity-history-cursor:v1')
      .digest();
    return createHmac('sha256', key).update(payload).digest();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException('Invalid or expired activity cursor.');
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Partial<CursorPayload>;
  return (
    typeof payload.v === 'number' &&
    typeof payload.sub === 'string' &&
    typeof payload.filters === 'string' &&
    typeof payload.limit === 'number' &&
    typeof payload.issuedAt === 'number' &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.issuedAt) &&
    Number.isSafeInteger(payload.expiresAt) &&
    isContinuation(payload.position)
  );
}

function isContinuation(value: unknown): value is ActivityHistoryContinuation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<ActivityHistoryContinuation>;
  return (
    isPosition(candidate.after) &&
    isPosition(candidate.anchor) &&
    isAtOrBefore(candidate.after, candidate.anchor)
  );
}

function isPosition(
  value: unknown,
): value is ActivityHistoryContinuation['after'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const position = value as Partial<ActivityHistoryContinuation['after']>;
  return (
    typeof position.occurredAt === 'string' &&
    TIMESTAMP_PATTERN.test(position.occurredAt) &&
    typeof position.id === 'string' &&
    UUID_PATTERN.test(position.id)
  );
}

function isAtOrBefore(
  after: ActivityHistoryContinuation['after'],
  anchor: ActivityHistoryContinuation['anchor'],
): boolean {
  return (
    after.occurredAt < anchor.occurredAt ||
    (after.occurredAt === anchor.occurredAt &&
      after.id.toLowerCase() <= anchor.id.toLowerCase())
  );
}
