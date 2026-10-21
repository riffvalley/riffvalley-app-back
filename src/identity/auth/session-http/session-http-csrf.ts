import { createHmac, timingSafeEqual } from 'crypto';
import { SessionClientType } from '../../sessions/entities/auth-session.entity';
import { SessionCsrfVerifier } from './session-http-security';

export type SessionCsrfOperation = 'login' | 'refresh' | 'logout';

interface SessionCsrfClaims {
  version: 1;
  operation: SessionCsrfOperation;
  clientType: SessionClientType;
  binding: string;
  expiresAt: number;
}

const CSRF_KEY_CONTEXT = 'riffvalley:auth-session:csrf:v1';
const MAX_LOGIN_CSRF_LIFETIME_MS = 10 * 60 * 1000;
const MAX_SESSION_CSRF_LIFETIME_MS = 30 * 60 * 1000;

/**
 * Creates a short-lived pre-login token bound to the bootstrap nonce cookie.
 * The nonce is not an authenticator; login still requires the user's password.
 */
export function createLoginCsrfToken(
  secret: string | undefined,
  clientType: SessionClientType,
  nonce: string,
  expiresAt: number,
  now = Date.now(),
): string | null {
  if (
    !nonce ||
    expiresAt <= now ||
    expiresAt - now > MAX_LOGIN_CSRF_LIFETIME_MS
  ) {
    return null;
  }
  return signClaims(secret, {
    version: 1,
    operation: 'login',
    clientType,
    binding: nonce,
    expiresAt,
  });
}

/** Creates a short-lived token bound to one session and one operation. */
export function createSessionCsrfToken(
  secret: string | undefined,
  operation: 'refresh' | 'logout',
  clientType: SessionClientType,
  sessionId: string,
  expiresAt: number,
  now = Date.now(),
): string | null {
  if (
    !sessionId ||
    expiresAt <= now ||
    expiresAt - now > MAX_SESSION_CSRF_LIFETIME_MS
  ) {
    return null;
  }
  return signClaims(secret, {
    version: 1,
    operation,
    clientType,
    binding: sessionId,
    expiresAt,
  });
}

export function createLoginCsrfVerifier(
  secret: string | undefined,
  nonce: string | undefined,
  now = Date.now(),
): SessionCsrfVerifier {
  return (token, clientType) =>
    nonce !== undefined &&
    verifyClaims(secret, token, {
      operation: 'login',
      clientType,
      binding: nonce,
      maxLifetimeMs: MAX_LOGIN_CSRF_LIFETIME_MS,
      now,
    });
}

export function createSessionCsrfVerifier(
  secret: string | undefined,
  operation: 'refresh' | 'logout',
  sessionId: string | undefined,
  now = Date.now(),
): SessionCsrfVerifier {
  return (token, clientType) =>
    sessionId !== undefined &&
    verifyClaims(secret, token, {
      operation,
      clientType,
      binding: sessionId,
      maxLifetimeMs: MAX_SESSION_CSRF_LIFETIME_MS,
      now,
    });
}

function signClaims(
  secret: string | undefined,
  claims: SessionCsrfClaims,
): string | null {
  const key = deriveKey(secret);
  if (!key) return null;
  const payload = encode(JSON.stringify(claims));
  const signature = createHmac('sha256', key)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyClaims(
  secret: string | undefined,
  token: string,
  expected: {
    operation: SessionCsrfOperation;
    clientType: SessionClientType;
    binding: string;
    maxLifetimeMs: number;
    now: number;
  },
): boolean {
  const key = deriveKey(secret);
  if (!key) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const expectedSignature = createHmac('sha256', key).update(parts[0]).digest();
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(parts[1], 'base64url');
  } catch {
    return false;
  }
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (!isSessionCsrfClaims(parsed)) return false;
  return (
    parsed.version === 1 &&
    parsed.operation === expected.operation &&
    parsed.clientType === expected.clientType &&
    parsed.binding === expected.binding &&
    parsed.expiresAt > expected.now &&
    parsed.expiresAt - expected.now <= expected.maxLifetimeMs
  );
}

function deriveKey(secret: string | undefined): Buffer | null {
  if (!secret) return null;
  return createHmac('sha256', secret).update(CSRF_KEY_CONTEXT).digest();
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function isSessionCsrfClaims(value: unknown): value is SessionCsrfClaims {
  if (typeof value !== 'object' || value === null) return false;
  const claims = value as Record<string, unknown>;
  return (
    claims.version === 1 &&
    (claims.operation === 'login' ||
      claims.operation === 'refresh' ||
      claims.operation === 'logout') &&
    (claims.clientType === 'app' || claims.clientType === 'wiki') &&
    typeof claims.binding === 'string' &&
    typeof claims.expiresAt === 'number' &&
    Number.isSafeInteger(claims.expiresAt)
  );
}
