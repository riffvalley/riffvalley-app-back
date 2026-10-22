import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createSessionRefreshCookieClearPolicy,
  createSessionRefreshCookiePolicy,
  readSessionCookieRequestMetadata,
  resolveSessionClientFromOrigin,
  resolveAuthRateLimitClientAddress,
  SESSION_HTTP_TRUST_PROXY,
  SESSION_EDGE_SECRET_CONFIG_KEY,
  SESSION_TRUSTED_EDGE_HEADER,
  SessionCookieRequestMetadata,
  SessionRequestRejectionReason,
  validateSessionCookieRequest,
} from '../session-http-security';

const origins = {
  app: 'https://app.riffvalley.es',
  wiki: 'https://wiki.riffvalley.es',
};
const edgeSecret = Buffer.alloc(32, 42).toString('base64url');

function createConfigService(secret?: string): ConfigService {
  return new ConfigService(
    secret === undefined ? {} : { [SESSION_EDGE_SECRET_CONFIG_KEY]: secret },
  );
}

describe('session HTTP security helpers', () => {
  it('keeps Express proxy trust disabled because forwarded protocol is ambiguous', () => {
    expect(SESSION_HTTP_TRUST_PROXY).toBe(false);
  });

  describe('rate limit client address', () => {
    it('uses Cloudflare client IP only with a valid private edge assertion', () => {
      expect(
        resolveAuthRateLimitClientAddress(
          {
            socket: { remoteAddress: '10.0.0.8' },
            headers: {
              [SESSION_TRUSTED_EDGE_HEADER]: edgeSecret,
              'cf-connecting-ip': '203.0.113.9',
              'x-forwarded-for': '198.51.100.1',
            },
          } as never,
          edgeSecret,
        ),
      ).toBe('203.0.113.9');
    });

    it('ignores spoofed forwarding headers without the valid edge assertion', () => {
      expect(
        resolveAuthRateLimitClientAddress(
          {
            socket: { remoteAddress: '::ffff:10.0.0.8' },
            headers: {
              [SESSION_TRUSTED_EDGE_HEADER]: 'invalid',
              'cf-connecting-ip': '203.0.113.9',
              'x-forwarded-for': '198.51.100.1',
            },
          } as never,
          edgeSecret,
        ),
      ).toBe('10.0.0.8');
    });

    it('falls back to the socket when the edge client IP is ambiguous', () => {
      expect(
        resolveAuthRateLimitClientAddress(
          {
            socket: { remoteAddress: '10.0.0.8' },
            headers: {
              [SESSION_TRUSTED_EDGE_HEADER]: [edgeSecret, edgeSecret],
              'cf-connecting-ip': '203.0.113.9',
            },
          } as never,
          edgeSecret,
        ),
      ).toBe('10.0.0.8');
    });
  });

  describe('readSessionCookieRequestMetadata', () => {
    it('uses Express secure state and the exact security headers', () => {
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: true,
            headers: {
              origin: origins.app,
              'content-type': 'application/json',
              'x-csrf-token': 'csrf',
              'sec-fetch-site': 'same-site',
            },
          },
          createConfigService(edgeSecret),
        ),
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
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: { 'x-forwarded-proto': 'https' },
          },
          createConfigService(edgeSecret),
        ),
      ).toEqual({
        secure: false,
        origin: undefined,
        contentType: undefined,
        csrfToken: undefined,
        fetchSite: undefined,
      });
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: {
              origin: origins.app,
              'content-type': 'application/json',
              'x-csrf-token': 'csrf',
              'x-forwarded-proto': 'https',
            },
          },
          createConfigService(edgeSecret),
        ).secure,
      ).toBe(false);
    });

    it.each(['https', 'http', 'https,http', 'http,https', ['https', 'http']])(
      'does not infer TLS from forwarded protocol %s',
      (forwardedProto) => {
        expect(
          readSessionCookieRequestMetadata(
            {
              secure: false,
              headers: { 'x-forwarded-proto': forwardedProto },
            },
            createConfigService(edgeSecret),
          ).secure,
        ).toBe(false);
      },
    );

    it('accepts actual socket TLS even if forwarded headers disagree', () => {
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: true,
            headers: { 'x-forwarded-proto': 'http,https' },
          },
          createConfigService(edgeSecret),
        ).secure,
      ).toBe(true);
    });

    it('accepts the private edge assertion only when it exactly matches', () => {
      const metadata = readSessionCookieRequestMetadata(
        {
          secure: false,
          headers: {
            'x-forwarded-proto': 'http',
            [SESSION_TRUSTED_EDGE_HEADER]: edgeSecret,
          },
        },
        createConfigService(edgeSecret),
      );
      expect(metadata.secure).toBe(true);

      expect(
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: {
              [SESSION_TRUSTED_EDGE_HEADER]: Buffer.alloc(32, 43).toString(
                'base64url',
              ),
            },
          },
          createConfigService(edgeSecret),
        ).secure,
      ).toBe(false);
    });

    it('fails closed when the edge secret is absent or malformed, including direct TLS', () => {
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: { [SESSION_TRUSTED_EDGE_HEADER]: edgeSecret },
          },
          createConfigService(),
        ).secure,
      ).toBe(false);
      expect(
        readSessionCookieRequestMetadata(
          { secure: true, headers: {} },
          createConfigService(),
        ).secure,
      ).toBe(false);
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: { [SESSION_TRUSTED_EDGE_HEADER]: edgeSecret },
          },
          createConfigService('not-a-256-bit-secret'),
        ).secure,
      ).toBe(false);
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: { [SESSION_TRUSTED_EDGE_HEADER]: 'a'.repeat(43) },
          },
          createConfigService('a'.repeat(43)),
        ).secure,
      ).toBe(false);
    });

    it('rejects duplicated edge assertion headers', () => {
      expect(
        readSessionCookieRequestMetadata(
          {
            secure: false,
            headers: {
              [SESSION_TRUSTED_EDGE_HEADER]: [edgeSecret, edgeSecret],
            },
          },
          createConfigService(edgeSecret),
        ).secure,
      ).toBe(false);
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
    const validCsrf = jest.fn((token: string) =>
      token === 'operation-bound-token'
        ? { valid: true as const }
        : { valid: false as const, reason: 'csrf_signature_invalid' as const },
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

    it.each([
      [{ ...validMetadata, secure: false }, 'https_required'],
      [{ ...validMetadata, origin: 'https://evil.example' }, 'origin_invalid'],
      [{ ...validMetadata, contentType: 'text/plain' }, 'content_type_invalid'],
      [{ ...validMetadata, fetchSite: 'none' }, 'browser_metadata_invalid'],
      [{ ...validMetadata, csrfToken: undefined }, 'csrf_missing'],
      [{ ...validMetadata, csrfToken: 'invalid' }, 'csrf_signature_invalid'],
    ] as const)(
      'reports the stable rejection reason %s',
      (metadata, expectedReason) => {
        const reasons: SessionRequestRejectionReason[] = [];
        const onRejected = (reason: SessionRequestRejectionReason): void => {
          reasons.push(reason);
        };
        const verify = jest.fn(() => ({
          valid: false as const,
          reason: 'csrf_signature_invalid' as const,
        }));

        try {
          validateSessionCookieRequest(
            metadata as SessionCookieRequestMetadata,
            origins,
            verify,
            onRejected,
          );
          throw new Error('Expected request validation to reject');
        } catch (error) {
          expect(error).toBeInstanceOf(ForbiddenException);
          expect((error as ForbiddenException).message).toBe(
            expectedReason === 'https_required'
              ? 'Session requests require HTTPS'
              : expectedReason === 'origin_invalid'
                ? 'Request origin is not allowed'
                : expectedReason === 'content_type_invalid'
                  ? 'Session requests must use JSON'
                  : expectedReason === 'csrf_missing' ||
                      expectedReason === 'csrf_signature_invalid'
                    ? 'CSRF validation failed'
                    : 'Request metadata is not allowed',
          );
        }

        expect(reasons).toEqual([expectedReason]);
      },
    );

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
