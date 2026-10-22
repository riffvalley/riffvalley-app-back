import { createHmac } from 'crypto';
import {
  createClientLogoutCsrfVerifier,
  createLoginCsrfToken,
  createLoginCsrfVerifier,
  createSessionCsrfToken,
  createSessionCsrfVerifier,
} from '../session-http-csrf';

const CSRF_KEY_CONTEXT = 'riffvalley:auth-session:csrf:v1';

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

      expect(verify(token ?? ' ', clientType)).toEqual({ valid: true });
      expect(
        verify(token ?? ' ', clientType === 'app' ? 'wiki' : 'app'),
      ).toEqual({ valid: false, reason: 'csrf_client_mismatch' });
      expect(
        createLoginCsrfVerifier(
          secret,
          'different-nonce',
          now,
        )(token ?? ' ', clientType),
      ).toEqual({ valid: false, reason: 'csrf_session_mismatch' });
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
      ).toEqual({ valid: true });
      expect(
        createSessionCsrfVerifier(
          secret,
          operation === 'refresh' ? 'logout' : 'refresh',
          'session-id',
          now,
        )(token ?? ' ', 'wiki'),
      ).toEqual({ valid: false, reason: 'csrf_operation_mismatch' });
      expect(
        createSessionCsrfVerifier(
          secret,
          operation,
          'other-session',
          now,
        )(token ?? ' ', 'wiki'),
      ).toEqual({ valid: false, reason: 'csrf_session_mismatch' });
      expect(
        createSessionCsrfVerifier(
          secret,
          operation,
          'session-id',
          now,
        )(token ?? ' ', 'app'),
      ).toEqual({ valid: false, reason: 'csrf_client_mismatch' });
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
    ).toEqual({ valid: false, reason: 'csrf_malformed' });
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
    ).toEqual({ valid: false, reason: 'csrf_expired' });
    expect(
      createLoginCsrfVerifier(undefined, 'nonce', now)(token ?? ' ', 'app'),
    ).toEqual({ valid: false, reason: 'csrf_verification_unavailable' });
  });

  it('reports safe verification failures without exposing token claims', () => {
    const token = createSessionCsrfToken(
      secret,
      'refresh',
      'app',
      'session-id',
      now + 60_000,
      now,
    );
    const [payload, signature] = (token ?? '').split('.');
    const tamperedSignature = `${payload}.${signature?.slice(0, -1)}x`;
    const verify = createSessionCsrfVerifier(
      secret,
      'refresh',
      'session-id',
      now,
    );

    expect(verify(tamperedSignature, 'app')).toEqual({
      valid: false,
      reason: 'csrf_signature_invalid',
    });
    expect(
      verify(
        signClaims({ operation: 'refresh', expiresAt: now + 1_800_001 }),
        'app',
      ),
    ).toEqual({
      valid: false,
      reason: 'csrf_claims_invalid',
    });
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

    expect(verify(logoutToken ?? '', 'app')).toEqual({ valid: true });
    expect(verify(logoutToken ?? '', 'wiki')).toEqual({
      valid: false,
      reason: 'csrf_client_mismatch',
    });
    expect(verify('not-a-token', 'app')).toEqual({
      valid: false,
      reason: 'csrf_malformed',
    });
    expect(
      createClientLogoutCsrfVerifier(secret, now + 60_000)(
        logoutToken ?? '',
        'app',
      ),
    ).toEqual({ valid: false, reason: 'csrf_expired' });
  });

  function signClaims(claimOverrides: Record<string, unknown>): string {
    const payload = Buffer.from(
      JSON.stringify({
        version: 1,
        operation: 'refresh',
        clientType: 'app',
        binding: 'session-id',
        expiresAt: now + 60_000,
        ...claimOverrides,
      }),
      'utf8',
    ).toString('base64url');
    const key = createHmac('sha256', secret).update(CSRF_KEY_CONTEXT).digest();
    const signature = createHmac('sha256', key)
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }
});
