import type { Response } from 'express';
import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SessionRefreshCookieAdapter } from '../session-refresh-cookie-adapter';

const origins = {
  app: 'https://app.riffvalley.es',
  wiki: 'https://wiki.riffvalley.es',
};
const validMetadata = {
  secure: true,
  origin: origins.app,
  contentType: 'application/json',
  csrfToken: 'csrf-valid',
  fetchSite: 'same-site',
};
const validToken = 'A'.repeat(43);

describe('SessionRefreshCookieAdapter', () => {
  const adapter = new SessionRefreshCookieAdapter();

  describe('readRefreshToken', () => {
    it('reads only the cookie assigned to the selected client', () => {
      expect(
        adapter.readRefreshToken(
          `other=value; __Secure-rv_app_refresh=${validToken}`,
          'app',
          validMetadata,
          origins,
          () => true,
        ),
      ).toBe(validToken);
      expect(
        adapter.readRefreshToken(
          `__Secure-rv_app_refresh=${validToken}`,
          'wiki',
          { ...validMetadata, origin: origins.wiki },
          origins,
          () => true,
        ),
      ).toBeNull();
    });

    it.each([
      `__Secure-rv_app_refresh=${validToken}; __Secure-rv_app_refresh=${validToken}`,
      '__Secure-rv_app_refresh=short',
      '__Secure-rv_app_refresh=contains%20encoding',
      '__Secure-rv_app_refresh',
    ])('rejects duplicate or malformed cookie values: %s', (cookieHeader) => {
      expect(
        adapter.readRefreshToken(
          cookieHeader,
          'app',
          validMetadata,
          origins,
          () => true,
        ),
      ).toBeNull();
    });

    it('validates HTTPS, Origin and CSRF before reading a cookie', () => {
      expect(() =>
        adapter.readRefreshToken(
          `__Secure-rv_app_refresh=${validToken}`,
          'app',
          { ...validMetadata, secure: false },
          origins,
          () => true,
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        adapter.readRefreshToken(
          `__Secure-rv_app_refresh=${validToken}`,
          'app',
          validMetadata,
          origins,
          () => false,
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('emitRefreshToken', () => {
    const expiry = new Date('2026-11-20T10:00:00.000Z');
    let cookie: jest.Mock<Response, Parameters<Response['cookie']>>;
    let response: Pick<Response, 'cookie'>;

    beforeEach(() => {
      cookie = jest.fn<Response, Parameters<Response['cookie']>>();
      response = { cookie };
    });

    it('emits the raw refresh credential only as a client-specific HttpOnly cookie', () => {
      adapter.emitRefreshToken(
        response,
        'app',
        validToken,
        expiry,
        validMetadata,
        origins,
        (token) => token === 'csrf-valid',
        new Date('2026-10-21T10:00:00.000Z'),
      );

      expect(cookie).toHaveBeenCalledWith(
        '__Secure-rv_app_refresh',
        validToken,
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/auth',
          expires: expiry,
        },
      );
    });

    it('rejects insecure or unauthorized requests before emitting a cookie', () => {
      expect(() =>
        adapter.emitRefreshToken(
          response,
          'app',
          validToken,
          expiry,
          { ...validMetadata, secure: false },
          origins,
          () => true,
        ),
      ).toThrow(ForbiddenException);
      expect(cookie).not.toHaveBeenCalled();

      expect(() =>
        adapter.emitRefreshToken(
          response,
          'app',
          validToken,
          expiry,
          { ...validMetadata, origin: 'https://evil.example' },
          origins,
          () => true,
        ),
      ).toThrow(ForbiddenException);
      expect(cookie).not.toHaveBeenCalled();
    });

    it('rejects a client mismatch, invalid CSRF and malformed refresh value', () => {
      expect(() =>
        adapter.emitRefreshToken(
          response,
          'wiki',
          validToken,
          expiry,
          validMetadata,
          origins,
          () => true,
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        adapter.emitRefreshToken(
          response,
          'app',
          'invalid-token',
          expiry,
          validMetadata,
          origins,
          () => false,
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        adapter.emitRefreshToken(
          response,
          'app',
          'invalid-token',
          expiry,
          validMetadata,
          origins,
          () => true,
        ),
      ).toThrow(InternalServerErrorException);
      expect(cookie).not.toHaveBeenCalled();
    });
  });

  describe('clearRefreshToken', () => {
    let clearCookie: jest.Mock<Response, Parameters<Response['clearCookie']>>;
    let response: Pick<Response, 'clearCookie'>;

    beforeEach(() => {
      clearCookie = jest.fn<Response, Parameters<Response['clearCookie']>>();
      response = { clearCookie };
    });

    it('clears the matching client cookie with the same host and path scope', () => {
      adapter.clearRefreshToken(
        response,
        'app',
        validMetadata,
        origins,
        (token) => token === 'csrf-valid',
      );

      const options = clearCookie.mock.calls[0][1];
      expect(clearCookie.mock.calls[0][0]).toBe('__Secure-rv_app_refresh');
      expect(options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth',
        expires: new Date(0),
      });
      expect(options).not.toHaveProperty('domain');
    });

    it('does not clear a cookie for an invalid Origin or CSRF token', () => {
      expect(() =>
        adapter.clearRefreshToken(
          response,
          'app',
          { ...validMetadata, origin: 'https://evil.example' },
          origins,
          () => true,
        ),
      ).toThrow(ForbiddenException);
      expect(clearCookie).not.toHaveBeenCalled();
    });
  });
});
