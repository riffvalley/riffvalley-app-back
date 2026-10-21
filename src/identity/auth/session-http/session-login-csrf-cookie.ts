import type { Response } from 'express';

const LOGIN_CSRF_NONCE_COOKIE = '__Secure-rv_login_csrf_nonce';
const LOGIN_CSRF_NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Stores the non-authenticating pre-login binding in an HttpOnly cookie. */
export class SessionLoginCsrfCookieAdapter {
  readNonce(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;

    const matches = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${LOGIN_CSRF_NONCE_COOKIE}=`));
    if (matches.length !== 1) return undefined;

    const nonce = matches[0].slice(LOGIN_CSRF_NONCE_COOKIE.length + 1);
    return LOGIN_CSRF_NONCE_PATTERN.test(nonce) ? nonce : undefined;
  }

  issue(response: Pick<Response, 'cookie'>, nonce: string): void {
    if (!LOGIN_CSRF_NONCE_PATTERN.test(nonce)) {
      throw new TypeError('CSRF nonce is malformed');
    }

    response.cookie(LOGIN_CSRF_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 10 * 60 * 1000,
    });
  }
}
