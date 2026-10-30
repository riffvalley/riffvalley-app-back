import {
  AUTH_HTTP_CORS_OPTIONS,
  AUTH_HTTP_CORS_ORIGINS,
  isAllowedAuthHttpOrigin,
} from '../session-http-cors';

describe('auth HTTP CORS policy', () => {
  it('keeps exact configured origins and rejects arbitrary or malformed origins', () => {
    expect(AUTH_HTTP_CORS_ORIGINS).toContain('https://app.riffvalley.es');
    expect(AUTH_HTTP_CORS_ORIGINS).toContain('https://beta.riffvalley.es');
    expect(AUTH_HTTP_CORS_ORIGINS).toContain('https://wiki.riffvalley.es');
    expect(AUTH_HTTP_CORS_ORIGINS).not.toContain('*');
    expect(isAllowedAuthHttpOrigin('https://app.riffvalley.es')).toBe(true);
    expect(isAllowedAuthHttpOrigin('https://beta.riffvalley.es')).toBe(true);
    expect(isAllowedAuthHttpOrigin('https://wiki.riffvalley.es')).toBe(true);
    expect(isAllowedAuthHttpOrigin('https://evil.example')).toBe(false);
    expect(isAllowedAuthHttpOrigin('https://app.riffvalley.es/')).toBe(false);
    expect(isAllowedAuthHttpOrigin(undefined)).toBe(false);
  });

  it('allows credentials only through the explicit origin allowlist', () => {
    expect(AUTH_HTTP_CORS_OPTIONS.origin).toEqual([...AUTH_HTTP_CORS_ORIGINS]);
    expect(AUTH_HTTP_CORS_OPTIONS.credentials).toBe(true);
  });

  it('allows the legacy and refresh protocol headers in preflight', () => {
    expect(AUTH_HTTP_CORS_OPTIONS.allowedHeaders).toEqual(
      expect.arrayContaining([
        'Authorization',
        'Content-Type',
        'X-Custom-Lang',
        'X-Auth-Session-Mode',
        'X-CSRF-Token',
        'X-Refresh-Operation',
      ]),
    );
    expect(AUTH_HTTP_CORS_OPTIONS.methods).toContain('OPTIONS');
  });
});
