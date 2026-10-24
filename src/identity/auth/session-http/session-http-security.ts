import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { SessionClientType } from '../../sessions/entities/auth-session.entity';

export interface SessionClientOrigins {
  app: string | undefined;
  wiki: string | undefined;
}

/** Heroku's forwarded protocol header is not authoritative for TLS decisions. */
export const SESSION_HTTP_TRUST_PROXY = false;
export const SESSION_TRUSTED_EDGE_HEADER = 'x-rv-session-edge';
export const SESSION_EDGE_SECRET_CONFIG_KEY = 'AUTH_SESSION_EDGE_SECRET';

const EDGE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EDGE_SECRET_BYTES = 32;

export interface SessionRefreshCookieOptions {
  httpOnly: true;
  secure: true;
  sameSite: 'lax' | 'none';
  partitioned?: true;
  path: '/api/auth';
  expires: Date;
}

export interface SessionRefreshCookiePolicy {
  name: string;
  options: SessionRefreshCookieOptions;
}

export interface SessionCookieRequestMetadata {
  secure: boolean;
  origin: string | undefined;
  contentType: string | undefined;
  csrfToken: string | undefined;
  fetchSite: string | undefined;
}

export type SessionCsrfFailureReason =
  | 'csrf_malformed'
  | 'csrf_signature_invalid'
  | 'csrf_claims_invalid'
  | 'csrf_expired'
  | 'csrf_operation_mismatch'
  | 'csrf_client_mismatch'
  | 'csrf_session_mismatch'
  | 'csrf_verification_unavailable';

export type SessionCsrfVerificationResult =
  | { valid: true }
  | { valid: false; reason: SessionCsrfFailureReason };

export type SessionCsrfVerifier = (
  token: string,
  clientType: SessionClientType,
) => SessionCsrfVerificationResult;

export type SessionRequestRejectionReason =
  | 'https_required'
  | 'origin_invalid'
  | 'content_type_invalid'
  | 'browser_metadata_invalid'
  | 'csrf_missing'
  | SessionCsrfFailureReason
  | 'client_type_mismatch';

export type SessionRequestRejectionHandler = (
  reason: SessionRequestRejectionReason,
) => void;

export function readSessionCookieRequestMetadata(
  request: Pick<Request, 'secure' | 'headers'>,
  configService: Pick<ConfigService, 'get'>,
): SessionCookieRequestMetadata {
  const trustedEdgeSecret = configService.get<string>(
    SESSION_EDGE_SECRET_CONFIG_KEY,
  );

  return {
    secure: isSecureSessionTransport(
      request.secure,
      readSingleHeader(request.headers[SESSION_TRUSTED_EDGE_HEADER]),
      trustedEdgeSecret,
    ),
    origin: readSingleHeader(request.headers.origin),
    contentType: readSingleHeader(request.headers['content-type']),
    csrfToken: readSingleHeader(request.headers['x-csrf-token']),
    fetchSite: readSingleHeader(request.headers['sec-fetch-site']),
  };
}

/**
 * Recognizes direct socket TLS or a private edge assertion only when the
 * server-configured secret is valid. The edge secret is safe only when a
 * trusted edge overwrites this custom header and prevents direct origin
 * access; forwarded-proto is deliberately ignored.
 */
export function isSecureSessionTransport(
  socketSecure: boolean,
  edgeAssertion: string | undefined,
  trustedEdgeSecret: string | undefined,
): boolean {
  const expectedBytes = decodeEdgeSecret(trustedEdgeSecret);
  if (!expectedBytes) return false;
  if (socketSecure) return true;

  const assertionBytes = decodeEdgeSecret(edgeAssertion);
  if (!assertionBytes) return false;

  return timingSafeEqual(assertionBytes, expectedBytes);
}

export function hasTrustedSessionEdgeAssertion(
  edgeAssertion: string | undefined,
  trustedEdgeSecret: string | undefined,
): boolean {
  const expectedBytes = decodeEdgeSecret(trustedEdgeSecret);
  const assertionBytes = decodeEdgeSecret(edgeAssertion);
  return Boolean(
    expectedBytes &&
      assertionBytes &&
      timingSafeEqual(assertionBytes, expectedBytes),
  );
}

/**
 * Uses Cloudflare's overwritten client-IP header only behind the private edge
 * assertion; otherwise counts by the direct socket peer. Forwarded headers are
 * deliberately not accepted as client identity.
 */
export function resolveAuthRateLimitClientAddress(
  request: Pick<Request, 'socket' | 'headers'>,
  trustedEdgeSecret: string | undefined,
): string | null {
  const edgeAssertion = readSingleHeader(
    request.headers[SESSION_TRUSTED_EDGE_HEADER],
  );
  const edgeClientAddress = readSingleHeader(
    request.headers['cf-connecting-ip'],
  );
  if (
    hasTrustedSessionEdgeAssertion(edgeAssertion, trustedEdgeSecret) &&
    edgeClientAddress
  ) {
    const normalized = normalizeIpAddress(edgeClientAddress);
    if (normalized) return normalized;
  }

  return normalizeIpAddress(request.socket.remoteAddress ?? '');
}

function normalizeIpAddress(value: string): string | null {
  if (isIP(value) === 0) return null;
  const ipv4Mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const candidate = ipv4Mapped?.[1] ?? value;
  try {
    const hostname = new URL(
      candidate.includes(':')
        ? `http://[${candidate}]/`
        : `http://${candidate}/`,
    ).hostname;
    return hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

function decodeEdgeSecret(value: string | undefined): Buffer | undefined {
  if (!value || !EDGE_SECRET_PATTERN.test(value)) return undefined;
  const bytes = Buffer.from(value, 'base64url');
  if (
    bytes.length !== EDGE_SECRET_BYTES ||
    bytes.toString('base64url') !== value
  ) {
    return undefined;
  }
  return bytes;
}

const SESSION_REFRESH_COOKIE_NAMES: Record<SessionClientType, string> = {
  app: '__Secure-rv_app_refresh',
  wiki: '__Secure-rv_wiki_refresh',
};

const SESSION_COOKIE_PATH = '/api/auth';
const ALLOWED_FETCH_SITES = new Set(['cross-site', 'same-origin', 'same-site']);
export const LOCAL_SESSION_APP_ORIGIN = 'http://localhost:5173';

function sessionCookieSameSite(origin: string | undefined): 'lax' | 'none' {
  return origin === LOCAL_SESSION_APP_ORIGIN ? 'none' : 'lax';
}

function sessionCookiePartitionOption(
  origin: string | undefined,
): { partitioned: true } | Record<never, never> {
  return origin === LOCAL_SESSION_APP_ORIGIN ? { partitioned: true } : {};
}

export function resolveSessionClientFromOrigin(
  origin: string | undefined,
  configuredOrigins: SessionClientOrigins,
): SessionClientType | null {
  if (
    !isCanonicalHttpsOrigin(configuredOrigins.app) ||
    !isCanonicalHttpsOrigin(configuredOrigins.wiki) ||
    configuredOrigins.app === configuredOrigins.wiki
  ) {
    return null;
  }

  if (origin === configuredOrigins.app) return 'app';
  if (origin === configuredOrigins.wiki) return 'wiki';
  if (origin === LOCAL_SESSION_APP_ORIGIN) return 'app';
  return null;
}

/**
 * Builds options for a host-only cookie. The API host owns the cookie; omitting
 * `domain` is intentional. Callers must not serialize the refresh value.
 */
export function createSessionRefreshCookiePolicy(
  clientType: SessionClientType,
  sessionExpiresAt: Date,
  now = new Date(),
  origin?: string,
): SessionRefreshCookiePolicy {
  if (
    !Number.isFinite(sessionExpiresAt.getTime()) ||
    sessionExpiresAt.getTime() <= now.getTime()
  ) {
    throw new RangeError('Session expiry must be in the future');
  }

  return {
    name: SESSION_REFRESH_COOKIE_NAMES[clientType],
    options: {
      httpOnly: true,
      secure: true,
      sameSite: sessionCookieSameSite(origin),
      ...sessionCookiePartitionOption(origin),
      path: SESSION_COOKIE_PATH,
      expires: new Date(sessionExpiresAt.getTime()),
    },
  };
}

export function createSessionRefreshCookieClearPolicy(
  clientType: SessionClientType,
  origin?: string,
): SessionRefreshCookiePolicy {
  return {
    name: SESSION_REFRESH_COOKIE_NAMES[clientType],
    options: {
      httpOnly: true,
      secure: true,
      sameSite: sessionCookieSameSite(origin),
      ...sessionCookiePartitionOption(origin),
      path: SESSION_COOKIE_PATH,
      expires: new Date(0),
    },
  };
}

/**
 * Validates the browser-facing requirements before any cookie is read or used.
 * The verifier is operation-specific: pre-login bootstrap and authenticated
 * session CSRF tokens have different bindings and must be checked separately.
 */
export function validateSessionCookieRequest(
  metadata: SessionCookieRequestMetadata,
  configuredOrigins: SessionClientOrigins,
  verifyCsrfToken: SessionCsrfVerifier,
  onRejected?: SessionRequestRejectionHandler,
): SessionClientType {
  const clientType = validateSessionCookieRequestMetadata(
    metadata,
    configuredOrigins,
    onRejected,
  );

  if (!metadata.csrfToken) {
    onRejected?.('csrf_missing');
    throw new ForbiddenException('CSRF validation failed');
  }

  const csrfVerification = verifyCsrfToken(metadata.csrfToken, clientType);
  if (csrfVerification.valid === false) {
    onRejected?.(csrfVerification.reason);
    throw new ForbiddenException('CSRF validation failed');
  }

  return clientType;
}

/** Validates request controls that do not require reading the session cookie. */
export function validateSessionCookieRequestMetadata(
  metadata: SessionCookieRequestMetadata,
  configuredOrigins: SessionClientOrigins,
  onRejected?: SessionRequestRejectionHandler,
): SessionClientType {
  if (!metadata.secure) {
    onRejected?.('https_required');
    throw new ForbiddenException('Session requests require HTTPS');
  }

  const clientType = resolveSessionClientFromOrigin(
    metadata.origin,
    configuredOrigins,
  );
  if (!clientType) {
    onRejected?.('origin_invalid');
    throw new ForbiddenException('Request origin is not allowed');
  }

  if (!isJsonContentType(metadata.contentType)) {
    onRejected?.('content_type_invalid');
    throw new ForbiddenException('Session requests must use JSON');
  }

  if (
    metadata.fetchSite !== undefined &&
    !ALLOWED_FETCH_SITES.has(metadata.fetchSite)
  ) {
    onRejected?.('browser_metadata_invalid');
    throw new ForbiddenException('Request metadata is not allowed');
  }

  return clientType;
}

/**
 * Validates the non-mutating CSRF bootstrap. It intentionally has no JSON
 * Content-Type or CSRF-token requirement: this GET creates the first nonce and
 * token. HTTPS, exact Origin and valid Fetch Metadata remain mandatory.
 */
export function validateSessionCsrfBootstrapRequest(
  metadata: SessionCookieRequestMetadata,
  configuredOrigins: SessionClientOrigins,
): SessionClientType {
  if (!metadata.secure) {
    throw new ForbiddenException('Session requests require HTTPS');
  }

  const clientType = resolveSessionClientFromOrigin(
    metadata.origin,
    configuredOrigins,
  );
  if (!clientType) {
    throw new ForbiddenException('Request origin is not allowed');
  }

  if (
    metadata.fetchSite !== undefined &&
    !ALLOWED_FETCH_SITES.has(metadata.fetchSite)
  ) {
    throw new ForbiddenException('Request metadata is not allowed');
  }

  return clientType;
}

function isCanonicalHttpsOrigin(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.origin === value;
  } catch {
    return false;
  }
}

function isJsonContentType(value: string | undefined): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function readSingleHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : '';
}
