import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionClientType } from '../../sessions/entities/auth-session.entity';

export interface SessionClientOrigins {
  app: string | undefined;
  wiki: string | undefined;
}

export interface SessionRefreshCookieOptions {
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
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

export type SessionCsrfVerifier = (
  token: string,
  clientType: SessionClientType,
) => boolean;

export function readSessionCookieRequestMetadata(
  request: Pick<Request, 'secure' | 'headers'>,
): SessionCookieRequestMetadata {
  return {
    secure: request.secure,
    origin: readSingleHeader(request.headers.origin),
    contentType: readSingleHeader(request.headers['content-type']),
    csrfToken: readSingleHeader(request.headers['x-csrf-token']),
    fetchSite: readSingleHeader(request.headers['sec-fetch-site']),
  };
}

const SESSION_REFRESH_COOKIE_NAMES: Record<SessionClientType, string> = {
  app: '__Secure-rv_app_refresh',
  wiki: '__Secure-rv_wiki_refresh',
};

const SESSION_COOKIE_PATH = '/api/auth';
const ALLOWED_FETCH_SITES = new Set(['cross-site', 'same-origin', 'same-site']);

export function resolveSessionClientFromOrigin(
  origin: string | undefined,
  configuredOrigins: SessionClientOrigins,
): SessionClientType | null {
  if (
    !isCanonicalHttpsOrigin(origin) ||
    !isCanonicalHttpsOrigin(configuredOrigins.app) ||
    !isCanonicalHttpsOrigin(configuredOrigins.wiki) ||
    configuredOrigins.app === configuredOrigins.wiki
  ) {
    return null;
  }

  if (origin === configuredOrigins.app) return 'app';
  if (origin === configuredOrigins.wiki) return 'wiki';
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
      sameSite: 'lax',
      path: SESSION_COOKIE_PATH,
      expires: new Date(sessionExpiresAt.getTime()),
    },
  };
}

export function createSessionRefreshCookieClearPolicy(
  clientType: SessionClientType,
): SessionRefreshCookiePolicy {
  return {
    name: SESSION_REFRESH_COOKIE_NAMES[clientType],
    options: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
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

  if (!isJsonContentType(metadata.contentType)) {
    throw new ForbiddenException('Session requests must use JSON');
  }

  if (
    metadata.fetchSite !== undefined &&
    !ALLOWED_FETCH_SITES.has(metadata.fetchSite)
  ) {
    throw new ForbiddenException('Request metadata is not allowed');
  }

  if (!metadata.csrfToken || !verifyCsrfToken(metadata.csrfToken, clientType)) {
    throw new ForbiddenException('CSRF validation failed');
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
  return typeof value === 'string' ? value : undefined;
}
