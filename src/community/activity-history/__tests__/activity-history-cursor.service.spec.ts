import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { ActivityHistoryCursorService } from '../activity-history-cursor.service';
import { ActivityHistoryFilters } from '../types/activity-history.types';

const SECRET = 'cursor-signing-secret-with-at-least-32-characters';
const USER_ID = '123e4567-e89b-42d3-a456-426614174111';
const FILTERS: ActivityHistoryFilters = {
  from: '2026-10-28',
  to: '2026-10-29',
  timeZone: 'Europe/Madrid',
  type: 'change',
  query: 'Album',
};
const POSITION = {
  after: {
    occurredAt: '2026-10-29T09:10:11.123456Z',
    id: '123e4567-e89b-42d3-a456-426614174000',
  },
  anchor: {
    occurredAt: '2026-10-29T09:10:11.123457Z',
    id: '123e4567-e89b-42d3-a456-426614174001',
  },
};

describe('ActivityHistoryCursorService', () => {
  let cursorService: ActivityHistoryCursorService;
  const now = Date.UTC(2026, 9, 29, 12);

  beforeEach(() => {
    cursorService = new ActivityHistoryCursorService(
      new ConfigService({ JWT_SECRET: SECRET }),
    );
  });

  it('signs and verifies a versioned cursor without losing timestamp microseconds', () => {
    const token = cursorService.create(USER_ID, FILTERS, 30, POSITION, now);
    expect(token).not.toContain('2026-10-29');
    expect(
      cursorService.verify(token, USER_ID, FILTERS, 30, now + 1000),
    ).toEqual(POSITION);
  });

  it('expires exactly after 24 hours', () => {
    const token = cursorService.create(USER_ID, FILTERS, 30, POSITION, now);
    expect(() =>
      cursorService.verify(
        token,
        USER_ID,
        FILTERS,
        30,
        now + 24 * 60 * 60 * 1000,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      cursorService.verify(
        token,
        USER_ID,
        FILTERS,
        30,
        now + 24 * 60 * 60 * 1000 - 1,
      ),
    ).not.toThrow();
  });

  it('rejects altered signatures and cursor reuse with another user, filters, or limit', () => {
    const token = cursorService.create(USER_ID, FILTERS, 30, POSITION, now);
    const [payload, signature] = token.split('.');
    const altered = `${payload}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    const changedFilters = { ...FILTERS, query: 'Other' };

    expect(() =>
      cursorService.verify(altered, USER_ID, FILTERS, 30, now),
    ).toThrow(BadRequestException);
    expect(() =>
      cursorService.verify(token, 'another-user', FILTERS, 30, now),
    ).toThrow(BadRequestException);
    expect(() =>
      cursorService.verify(token, USER_ID, changedFilters, 30, now),
    ).toThrow(BadRequestException);
    expect(() =>
      cursorService.verify(token, USER_ID, FILTERS, 31, now),
    ).toThrow(BadRequestException);
  });

  it('rejects a correctly signed cursor from an unsupported version', () => {
    const token = cursorService.create(USER_ID, FILTERS, 30, POSITION, now);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    payload.v = 2;
    const updatedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const key = createHmac('sha256', SECRET)
      .update('riffvalley:activity-history-cursor:v1')
      .digest();
    const signature = createHmac('sha256', key)
      .update(updatedPayload)
      .digest('base64url');

    expect(() =>
      cursorService.verify(
        `${updatedPayload}.${signature}`,
        USER_ID,
        FILTERS,
        30,
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts a configured secret regardless of length but rejects missing or default secrets', () => {
    const insecure = new ActivityHistoryCursorService(
      new ConfigService({ JWT_SECRET: 'your_long_random_jwt_secret' }),
    );
    const missing = new ActivityHistoryCursorService(new ConfigService());
    const short = new ActivityHistoryCursorService(
      new ConfigService({ JWT_SECRET: 'existing-secret' }),
    );
    const shortCursor = short.create(USER_ID, FILTERS, 30, POSITION, now);

    expect(short.verify(shortCursor, USER_ID, FILTERS, 30, now)).toEqual(
      POSITION,
    );
    expect(() => insecure.create(USER_ID, FILTERS, 30, POSITION, now)).toThrow(
      /secure JWT_SECRET/u,
    );
    expect(() => missing.create(USER_ID, FILTERS, 30, POSITION, now)).toThrow(
      /secure JWT_SECRET/u,
    );
  });

  it('rejects malformed and structurally impossible positions', () => {
    expect(() =>
      cursorService.create(
        USER_ID,
        FILTERS,
        30,
        {
          after: { occurredAt: 'not-a-timestamp', id: 'bad' },
          anchor: POSITION.anchor,
        },
        now,
      ),
    ).toThrow(BadRequestException);
  });
});
