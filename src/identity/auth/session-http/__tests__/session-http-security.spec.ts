import { ForbiddenException } from '@nestjs/common';
import {
  createSessionRefreshCookieClearPolicy,
  createSessionRefreshCookiePolicy,
  readSessionCookieRequestMetadata,
  resolveSessionClientFromOrigin,
  validateSessionCookieRequest,
} from '../session-http-security';

const origins = {
  app: 'https://app.riffvalley.es',
  wiki: 'https://wiki.riffvalley.es',
};

describe('session HTTP security helpers', () => {
  describe('readSessionCookieRequestMetadata', () => {
    it('uses Express secure state and the exact security headers', () => {
      expect(
        readSessionCookieRequestMetadata({
          secure: true,
          headers: {
            origin: origins.app,
            'content-type': 'application/json',
            'x-csrf-token': 'csrf',
            'sec-fetch-site': 'same-site',
          },
        }),
      ).toEqual({
        secure: true,
        origin: origins.app,
        contentType: 'application/json',
        csrfToken: 'csrf',
        fetchSite: 'same-site',
      });
    });

    it('fails closed for absent Origin and insecure requests', () => {
      expect(
        readSessionCookieRequestMetadata({
          secure: false,
          headers: {},
        }),
      ).toEqual({
        secure: false,
        origin: undefined,
        contentType: undefined,
        csrfToken: undefined,
        fetchSite: undefined,
      });
    });
  });

  describe('resolveSessionClientFromOrigin', () => {
    it.each([
      [origins.app, 'app'],
      [origins.wiki, 'wiki'],
    ] as const)('maps the exact origin %s to %s', (origin, client) => {
      expect(resolveSessionClientFromOrigin(origin, origins)).toBe(client);
    });

    it.each([
      undefined,
      'http://app.riffvalley.es',
      'https://app.riffvalley.es/',
      'https://app.riffvalley.es.evil.example',
      'null',
    ])('rejects an invalid or unconfigured origin: %s', (origin) => {
      expect(resolveSessionClientFromOrigin(origin, origins)).toBeNull();
    });

    it('fails closed when configured origins are invalid or ambiguous', () => {
      expect(
        resolveSessionClientFromOrigin(origins.app, {
          app: origins.app,
          wiki: origins.app,
        }),
      ).toBeNull();
      expect(
        resolveSessionClientFromOrigin(origins.app, {
          app: 'http://app.riffvalley.es',
          wiki: origins.wiki,
        }),
      ).toBeNull();
    });
  });

  describe('refresh cookie policies', () => {
    const expiry = new Date('2026-11-20T10:00:00.000Z');

    it.each([
      ['app', '__Secure-rv_app_refresh'],
      ['wiki', '__Secure-rv_wiki_refresh'],
    ] as const)('builds a host-only secure cookie for %s', (client, name) => {
      const policy = createSessionRefreshCookiePolicy(client, expiry);

      expect(policy.name).toBe(name);
      expect(policy.options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth',
        expires: expiry,
      });
      expect(policy.options).not.toHaveProperty('domain');
    });

    it('uses the absolute session expiry and rejects invalid or expired values', () => {
      const now = new Date('2026-10-21T10:00:00.000Z');
      expect(
        createSessionRefreshCookiePolicy('app', expiry, now).options.expires,
      ).toEqual(expiry);
      expect(() =>
        createSessionRefreshCookiePolicy('app', new Date(Number.NaN), now),
      ).toThrow(RangeError);
      expect(() => createSessionRefreshCookiePolicy('app', now, now)).toThrow(
        RangeError,
      );
    });

    it('clears the same client-specific host-only cookie with matching scope', () => {
      const app = createSessionRefreshCookieClearPolicy('app');
      const wiki = createSessionRefreshCookieClearPolicy('wiki');

      expect(app.name).toBe('__Secure-rv_app_refresh');
      expect(wiki.name).toBe('__Secure-rv_wiki_refresh');
      expect(app.options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth',
        expires: new Date(0),
      });
      expect(app.options).not.toHaveProperty('domain');
    });
  });

  describe('validateSessionCookieRequest', () => {
    const validMetadata = {
      secure: true,
      origin: origins.app,
      contentType: 'application/json; charset=utf-8',
      csrfToken: 'operation-bound-token',
      fetchSite: 'cross-site',
    };
    const validCsrf = jest.fn(
      (token: string) => token === 'operation-bound-token',
    );

    beforeEach(() => validCsrf.mockClear());

    it('requires exact Origin, JSON, Fetch Metadata and a valid CSRF token', () => {
      expect(
        validateSessionCookieRequest(validMetadata, origins, validCsrf),
      ).toBe('app');
      expect(validCsrf).toHaveBeenCalledWith('operation-bound-token', 'app');
    });

    it.each([
      [{ ...validMetadata, secure: false }, validCsrf],
      [{ ...validMetadata, origin: 'https://evil.example' }, validCsrf],
      [{ ...validMetadata, contentType: 'text/plain' }, validCsrf],
      [{ ...validMetadata, fetchSite: 'none' }, validCsrf],
      [{ ...validMetadata, csrfToken: undefined }, validCsrf],
      [{ ...validMetadata, csrfToken: 'invalid' }, validCsrf],
    ])('rejects invalid cookie request metadata', (metadata, verify) => {
      expect(() =>
        validateSessionCookieRequest(metadata, origins, verify),
      ).toThrow(ForbiddenException);
    });

    it('rejects insecure requests before invoking the CSRF verifier', () => {
      expect(() =>
        validateSessionCookieRequest(
          { ...validMetadata, secure: false },
          origins,
          validCsrf,
        ),
      ).toThrow(ForbiddenException);
      expect(validCsrf).not.toHaveBeenCalled();
    });

    it('accepts a missing Fetch Metadata header only with valid Origin and CSRF', () => {
      expect(
        validateSessionCookieRequest(
          { ...validMetadata, fetchSite: undefined },
          origins,
          validCsrf,
        ),
      ).toBe('app');
    });
  });
});
