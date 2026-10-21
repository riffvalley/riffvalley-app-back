import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthRateLimitService } from '../auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const jwtSecret = 'test-secret-with-enough-entropy-for-rate-limit';

  function createService(query: jest.Mock) {
    return new AuthRateLimitService(
      { query } as never,
      new ConfigService({ JWT_SECRET: jwtSecret }),
    );
  }

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('persists only scoped HMAC digests and returns the longest retry window', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        scope: 'login_account',
        attempt_count: 6,
        attempt_limit: 5,
        retry_after_seconds: 42,
      },
      {
        scope: 'login_ip',
        attempt_count: 31,
        attempt_limit: 30,
        retry_after_seconds: 29,
      },
    ]);
    const service = createService(query);

    await expect(
      service.consume([
        {
          scope: 'login_account',
          subject: 'Listener@example.test',
          limit: 5,
          windowSeconds: 900,
        },
        {
          scope: 'login_ip',
          subject: '192.0.2.3',
          limit: 30,
          windowSeconds: 900,
        },
      ]),
    ).resolves.toBe(42);

    const parameters = query.mock.calls[0][1] as unknown[];
    expect(parameters[0]).toEqual(['login_account', 'login_ip']);
    expect(parameters[1]).toEqual(
      expect.arrayContaining([expect.any(Buffer), expect.any(Buffer)]),
    );
    expect(JSON.stringify(parameters)).not.toContain('Listener@example.test');
    expect(JSON.stringify(parameters)).not.toContain('192.0.2.3');
  });

  it('accepts an existing 25-byte JWT secret for HMAC rate-limit keys', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = new AuthRateLimitService(
      { query } as never,
      new ConfigService({ JWT_SECRET: 'A7d4f9K2m6Q8v3R5s1T0x9B4c' }),
    );

    await expect(
      service.consume([
        {
          scope: 'login_ip',
          subject: '192.0.2.3',
          limit: 30,
          windowSeconds: 900,
        },
      ]),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails closed when PostgreSQL cannot persist the decision', async () => {
    const service = createService(jest.fn().mockRejectedValue(new Error('db')));

    await expect(
      service.consume([
        {
          scope: 'csrf_bootstrap_ip_app',
          subject: '192.0.2.3',
          limit: 30,
          windowSeconds: 900,
        },
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not query for an empty dimension set', async () => {
    const query = jest.fn();
    const service = createService(query);

    await expect(service.consume([])).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
