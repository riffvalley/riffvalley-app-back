import {
  createClientLogoutCsrfVerifier,
  createLoginCsrfToken,
  createLoginCsrfVerifier,
  createSessionCsrfToken,
  createSessionCsrfVerifier,
} from '../session-http-csrf';

describe('session HTTP CSRF tokens', () => {
  const secret = 'test-jwt-secret';
  const now = 1_800_000_000_000;

  it.each(['app', 'wiki'] as const)(
    'binds renewable login CSRF to the %s client and bootstrap nonce',
    (clientType) => {
      const token = createLoginCsrfToken(
        secret,
        clientType,
        'nonce-from-http-only-bootstrap-cookie',
        now + 60_000,
        now,
      );
      expect(token).not.toBeNull();
      const verify = createLoginCsrfVerifier(
        secret,
        'nonce-from-http-only-bootstrap-cookie',
        now,
      );

      expect(verify(token ?? ' ', clientType)).toBe(true);
      expect(verify(token ?? ' ', clientType === 'app' ? 'wiki' : 'app')).toBe(
        false,
      );
      expect(
        createLoginCsrfVerifier(
          secret,
          'different-nonce',
          now,
        )(token ?? ' ', clientType),
      ).toBe(false);
    },
  );

  it.each(['refresh', 'logout'] as const)(
    'binds %s CSRF to the session, operation and client',
    (operation) => {
      const token = createSessionCsrfToken(
        secret,
        operation,
        'wiki',
        'session-id',
        now + 60_000,
        now,
      );
      expect(token).not.toBeNull();
      expect(
        createSessionCsrfVerifier(
          secret,
          operation,
          'session-id',
          now,
        )(token ?? ' ', 'wiki'),
      ).toBe(true);
      expect(
        createSessionCsrfVerifier(
          secret,
          operation === 'refresh' ? 'logout' : 'refresh',
          'session-id',
          now,
        )(token ?? ' ', 'wiki'),
      ).toBe(false);
      expect(
        createSessionCsrfVerifier(
          secret,
          operation,
          'other-session',
          now,
        )(token ?? ' ', 'wiki'),
      ).toBe(false);
      expect(
        createSessionCsrfVerifier(
          secret,
          operation,
          'session-id',
          now,
        )(token ?? ' ', 'app'),
      ).toBe(false);
    },
  );

  it('rejects expired, overlong, malformed and unverifiable tokens', () => {
    expect(createLoginCsrfToken(secret, 'app', 'nonce', now, now)).toBeNull();
    expect(
      createLoginCsrfToken(secret, 'app', 'nonce', now + 600_001, now),
    ).toBeNull();
    expect(
      createSessionCsrfToken(
        secret,
        'refresh',
        'app',
        'session-id',
        now + 1_800_001,
        now,
      ),
    ).toBeNull();
    expect(
      createLoginCsrfVerifier(secret, 'nonce', now)('not-a-token', 'app'),
    ).toBe(false);
    const token = createLoginCsrfToken(
      secret,
      'app',
      'nonce',
      now + 60_000,
      now,
    );
    expect(
      createLoginCsrfVerifier(
        secret,
        'nonce',
        now + 60_000,
      )(token ?? ' ', 'app'),
    ).toBe(false);
    expect(
      createLoginCsrfVerifier(undefined, 'nonce', now)(token ?? ' ', 'app'),
    ).toBe(false);
  });

  it('verifies a logout CSRF token for idempotent requests without a cookie', () => {
    const logoutToken = createSessionCsrfToken(
      secret,
      'logout',
      'app',
      'session-id',
      now + 60_000,
      now,
    );
    const verify = createClientLogoutCsrfVerifier(secret, now);

    expect(verify(logoutToken ?? '', 'app')).toBe(true);
    expect(verify(logoutToken ?? '', 'wiki')).toBe(false);
    expect(verify('not-a-token', 'app')).toBe(false);
    expect(
      createClientLogoutCsrfVerifier(secret, now + 60_000)(
        logoutToken ?? '',
        'app',
      ),
    ).toBe(false);
  });
});
