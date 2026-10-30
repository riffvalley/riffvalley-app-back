import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Preserve the existing exact-origin allowlist. Credentialed CORS is only
 * reflected for an origin in this list; no wildcard is used.
 */
export const AUTH_HTTP_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4321',
  'http://localhost:4322',
  'https://spammusic.netlify.app',
  'https://app.riffvalley.es',
  'https://beta.riffvalley.es',
  'https://www.riffvalley.es',
  'https://riffvalley.es',
  'https://wiki.riffvalley.es',
  'https://riffastro.netlify.app',
] as const;

export const AUTH_HTTP_CORS_OPTIONS: CorsOptions = {
  origin: [...AUTH_HTTP_CORS_ORIGINS],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-Custom-Lang',
    'X-Auth-Session-Mode',
    'X-CSRF-Token',
    'X-Refresh-Operation',
  ],
  credentials: true,
  optionsSuccessStatus: 204,
};

export function isAllowedAuthHttpOrigin(origin: string | undefined): boolean {
  return (
    origin !== undefined &&
    AUTH_HTTP_CORS_ORIGINS.some((allowedOrigin) => allowedOrigin === origin)
  );
}
