import { createHmac, timingSafeEqual } from 'crypto';
import { SessionClientType } from '../../sessions/entities/auth-session.entity';
import type {
  SessionCsrfVerificationResult,
  SessionCsrfVerifier,
} from './session-http-security';

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
    nonce === undefined
      ? { valid: false, reason: 'csrf_session_mismatch' }
      : verifyClaims(secret, token, {
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
    sessionId === undefined
      ? { valid: false, reason: 'csrf_session_mismatch' }
      : verifyClaims(secret, token, {
          operation,
          clientType,
          binding: sessionId,
          maxLifetimeMs: MAX_SESSION_CSRF_LIFETIME_MS,
          now,
        });
}

/** Verifies a signed logout token when no refresh cookie can identify its session. */
export function createClientLogoutCsrfVerifier(
  secret: string | undefined,
  now = Date.now(),
): SessionCsrfVerifier {
  return (token, clientType) => {
    const binding = readSessionCsrfBinding(token);
    return binding === null
      ? { valid: false, reason: 'csrf_malformed' }
      : verifyClaims(secret, token, {
          operation: 'logout',
          clientType,
          binding,
          maxLifetimeMs: MAX_SESSION_CSRF_LIFETIME_MS,
          now,
        });
  };
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
): SessionCsrfVerificationResult {
  const key = deriveKey(secret);
  if (!key) return { valid: false, reason: 'csrf_verification_unavailable' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'csrf_malformed' };
  }

  const expectedSignature = createHmac('sha256', key).update(parts[0]).digest();
  if (!/^[A-Za-z0-9_-]+$/.test(parts[1])) {
    return { valid: false, reason: 'csrf_signature_invalid' };
  }
  const providedSignature = Buffer.from(parts[1], 'base64url');
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { valid: false, reason: 'csrf_signature_invalid' };
  }

  // Do not classify claims before authenticating them: a bad signature cannot
  // safely reveal whether attacker-controlled claims name another session.
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'csrf_malformed' };
  }
  if (!isSessionCsrfClaims(parsed)) {
    return { valid: false, reason: 'csrf_claims_invalid' };
  }
  if (parsed.operation !== expected.operation) {
    return { valid: false, reason: 'csrf_operation_mismatch' };
  }
  if (parsed.clientType !== expected.clientType) {
    return { valid: false, reason: 'csrf_client_mismatch' };
  }
  if (parsed.binding !== expected.binding) {
    return { valid: false, reason: 'csrf_session_mismatch' };
  }
  if (parsed.expiresAt <= expected.now) {
    return { valid: false, reason: 'csrf_expired' };
  }
  if (parsed.expiresAt - expected.now > expected.maxLifetimeMs) {
    return { valid: false, reason: 'csrf_claims_invalid' };
  }
  return { valid: true };
}

function readSessionCsrfBinding(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isSessionCsrfClaims(parsed) || !parsed.binding) return null;
  return parsed.binding;
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
