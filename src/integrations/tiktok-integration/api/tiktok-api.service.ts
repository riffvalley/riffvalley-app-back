import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';
const TIKTOK_VIDEO_FIELDS = [
  'id',
  'title',
  'video_description',
  'duration',
  'cover_image_url',
  'share_url',
  'embed_link',
  'embed_html',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
  'create_time',
].join(',');

export class TiktokInvalidGrantError extends Error {}

export interface TiktokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

export interface TiktokUserInfoResponse {
  data?: { user?: { open_id: string; display_name?: string | null } };
  error?: TiktokProviderError;
}

export interface TiktokProviderError {
  code: string;
  message: string;
  log_id: string;
}

export interface TiktokVideoNode {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  share_url?: string;
  embed_link?: string;
  embed_html?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
  create_time?: number;
}

export interface TiktokVideoListResponse {
  data?: { videos?: TiktokVideoNode[]; cursor?: number; has_more?: boolean };
  error?: TiktokProviderError;
}

export interface TiktokVideoPageResult {
  ok: boolean;
  status: number;
  body: TiktokVideoListResponse;
}

export function sanitizeTiktokDiagnostic(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(
      /((?:access|refresh)[_-]?token|client[_-]?(?:key|secret)|authorization|password|credential(?:s)?|api[_-]?key)\s*[:=]\s*["']?[^,\s"'&}]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?\b/g,
      '[REDACTED]',
    )
    .slice(0, 240);
}

export function formatTiktokProviderError(
  error: TiktokProviderError | undefined,
): string {
  if (!error) return 'details unavailable';

  const details = [
    typeof error.code === 'string' && error.code
      ? `code=${sanitizeTiktokDiagnostic(error.code)}`
      : undefined,
    typeof error.message === 'string' && error.message
      ? `message=${sanitizeTiktokDiagnostic(error.message)}`
      : undefined,
    typeof error.log_id === 'string' && error.log_id
      ? `log_id=${sanitizeTiktokDiagnostic(error.log_id)}`
      : undefined,
  ].filter((value): value is string => value !== undefined);

  return details.length ? details.join(' ') : 'details unavailable';
}

export function formatTiktokException(error: unknown): string {
  if (error instanceof Error) {
    return `${sanitizeTiktokDiagnostic(error.name)}: ${sanitizeTiktokDiagnostic(
      error.message,
    )}`;
  }
  return typeof error === 'string'
    ? sanitizeTiktokDiagnostic(error)
    : 'Unknown error';
}

// TikTok includes `error: { code: "ok" }` on successful Display API responses.
export function isTiktokError(error?: TiktokProviderError): boolean {
  return !!error && error.code !== 'ok';
}

@Injectable()
export class TiktokApiService {
  private readonly logger = new Logger(TiktokApiService.name);

  constructor(private readonly configService: ConfigService) {}

  exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
  ): Promise<TiktokTokenResponse> {
    return this.tiktokTokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    );
  }

  refreshAccessToken(refreshToken: string): Promise<TiktokTokenResponse> {
    return this.tiktokTokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
  }

  async fetchUserInfo(
    accessToken: string,
  ): Promise<{ open_id: string; display_name: string | null } | null> {
    const response = await fetch(
      `${TIKTOK_API_URL}/user/info/?fields=open_id,display_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = (await response
      .json()
      .catch(() => ({}))) as TiktokUserInfoResponse;
    if (!response.ok || isTiktokError(body.error) || !body.data?.user) {
      this.logger.error(
        `No se pudo obtener el perfil de TikTok (HTTP ${response.status}): ${formatTiktokProviderError(body.error)}`,
      );
      return null;
    }
    return {
      open_id: body.data.user.open_id,
      display_name: body.data.user.display_name ?? null,
    };
  }

  async fetchVideoPage(
    accessToken: string,
    cursor?: number,
  ): Promise<TiktokVideoPageResult> {
    const response = await fetch(
      `${TIKTOK_API_URL}/video/list/?fields=${TIKTOK_VIDEO_FIELDS}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20, cursor }),
      },
    );
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.json()) as TiktokVideoListResponse,
    };
  }

  private async tiktokTokenRequest(
    body: URLSearchParams,
  ): Promise<TiktokTokenResponse> {
    body.set('client_key', this.requiredConfig('TIKTOK_CLIENT_KEY'));
    body.set('client_secret', this.requiredConfig('TIKTOK_CLIENT_SECRET'));

    // TikTok expects client credentials in the POST body, not Basic auth.
    const response = await fetch(`${TIKTOK_API_URL}/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    const responseBody = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    } & Partial<TiktokTokenResponse>;
    if (!response.ok || responseBody.error) {
      if (responseBody.error === 'invalid_grant') {
        throw new TiktokInvalidGrantError(
          responseBody.error_description || 'TikTok invalid_grant',
        );
      }
      throw new BadGatewayException(
        `TikTok OAuth respondió con ${response.status}${
          responseBody.error_description
            ? `: ${responseBody.error_description}`
            : ''
        }`,
      );
    }
    return responseBody as TiktokTokenResponse;
  }

  private requiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value)
      throw new InternalServerErrorException(`${name} no está configurada`);
    return value;
  }
}
