import type { Response } from 'express';
import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SessionClientType } from '../../sessions/entities/auth-session.entity';
import {
  createSessionRefreshCookieClearPolicy,
  createSessionRefreshCookiePolicy,
  SessionClientOrigins,
  SessionCookieRequestMetadata,
  SessionCsrfVerifier,
  SessionRequestRejectionHandler,
  validateSessionCookieRequest,
} from './session-http-security';

const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * HTTP-only adapter for the opaque refresh credential. Controllers must call
 * this only after their operation has succeeded; the refresh value is never a
 * JSON field. Each client has a separate cookie name on the API host.
 */
export class SessionRefreshCookieAdapter {
  /** Call only after transport, Origin, Content-Type and Fetch Metadata pass. */
  readRefreshTokenForValidatedClient(
    cookieHeader: string | undefined,
    clientType: SessionClientType,
  ): string | null {
    if (!cookieHeader) return null;

    const cookieName = createSessionRefreshCookieClearPolicy(clientType).name;
    const matches = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`));

    if (matches.length !== 1) return null;
    const token = matches[0].slice(cookieName.length + 1);
    return REFRESH_TOKEN_PATTERN.test(token) ? token : null;
  }

  readRefreshToken(
    cookieHeader: string | undefined,
    clientType: SessionClientType,
    metadata: SessionCookieRequestMetadata,
    configuredOrigins: SessionClientOrigins,
    verifyCsrfToken: SessionCsrfVerifier,
  ): string | null {
    this.validateClientRequest(
      metadata,
      configuredOrigins,
      verifyCsrfToken,
      clientType,
    );
    return this.readRefreshTokenForValidatedClient(cookieHeader, clientType);
  }

  emitRefreshToken(
    response: Pick<Response, 'cookie'>,
    clientType: SessionClientType,
    refreshToken: string,
    expiresAt: Date,
    metadata: SessionCookieRequestMetadata,
    configuredOrigins: SessionClientOrigins,
    verifyCsrfToken: SessionCsrfVerifier,
    now = new Date(),
    onRejected?: SessionRequestRejectionHandler,
  ): void {
    this.validateClientRequest(
      metadata,
      configuredOrigins,
      verifyCsrfToken,
      clientType,
      onRejected,
    );
    if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      throw new InternalServerErrorException(
        'Session cookie could not be prepared',
      );
    }

    let policy: ReturnType<typeof createSessionRefreshCookiePolicy>;
    try {
      policy = createSessionRefreshCookiePolicy(
        clientType,
        expiresAt,
        now,
        metadata.origin,
      );
    } catch {
      throw new InternalServerErrorException(
        'Session cookie could not be prepared',
      );
    }
    response.cookie(policy.name, refreshToken, policy.options);
  }

  clearRefreshToken(
    response: Pick<Response, 'clearCookie'>,
    clientType: SessionClientType,
    metadata: SessionCookieRequestMetadata,
    configuredOrigins: SessionClientOrigins,
    verifyCsrfToken: SessionCsrfVerifier,
  ): void {
    this.validateClientRequest(
      metadata,
      configuredOrigins,
      verifyCsrfToken,
      clientType,
    );
    const policy = createSessionRefreshCookieClearPolicy(
      clientType,
      metadata.origin,
    );
    response.clearCookie(policy.name, policy.options);
  }

  private validateClientRequest(
    metadata: SessionCookieRequestMetadata,
    configuredOrigins: SessionClientOrigins,
    verifyCsrfToken: SessionCsrfVerifier,
    expectedClient: SessionClientType,
    onRejected?: SessionRequestRejectionHandler,
  ): void {
    const resolvedClient = validateSessionCookieRequest(
      metadata,
      configuredOrigins,
      verifyCsrfToken,
      onRejected,
    );
    if (resolvedClient !== expectedClient) {
      onRejected?.('client_type_mismatch');
      throw new ForbiddenException('Request is not allowed');
    }
  }
}
