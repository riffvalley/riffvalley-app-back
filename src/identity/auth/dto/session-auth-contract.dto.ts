import { Exclude, Expose, Type } from 'class-transformer';
import { SessionClientType } from '../../sessions/entities/auth-session.entity';
import { LoginUserDto } from './login-user.dto';

export const AUTH_SESSION_MODE_HEADER = 'X-Auth-Session-Mode';
export const AUTH_SESSION_MODE = 'refresh-v1';
export const SESSION_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** The HTTP request reuses the legacy username/password payload unchanged. */
export class SessionLoginDto extends LoginUserDto {}

/** Public fields already consumed by App/Wiki, with no persistence details. */
@Exclude()
export class SessionAuthUserDto {
  @Expose()
  id: string;

  @Expose()
  username: string;

  @Expose()
  role: string;

  @Expose()
  image?: string | null;

  @Expose()
  dashboardButtonsEnabled?: boolean;

  @Expose()
  dashboardConfig?: { id: string; enabled: boolean }[] | null;

  @Expose()
  mobileDashboardConfig?: { id: string; enabled: boolean }[] | null;
}

/** Login remains flat and compatible with the legacy public profile/token shape. */
@Exclude()
export class SessionLoginResponseDto extends SessionAuthUserDto {
  @Expose()
  token: string;
}

/** JSON body for refresh; the rotating refresh credential is delivered separately by cookie. */
@Exclude()
export class SessionRefreshResponseDto {
  @Expose()
  token: string;

  /** Absolute session expiry, serialized as an ISO-8601 timestamp. */
  @Expose()
  expiresAt: string;

  @Expose()
  @Type(() => SessionAuthUserDto)
  user: SessionAuthUserDto;
}

/** Logout has no JSON body; a successful HTTP response is 204. */
export type SessionLogoutResponse = void;

/** Only the recognized server-side Origin mapping may select an App or Wiki session. */
export type SessionRequestClientType = SessionClientType;

/** Generic public error shape; never carries session/token/storage diagnostics. */
export interface SessionAuthErrorResponse {
  statusCode: 400 | 401 | 403 | 409 | 429 | 503 | 500;
  message: string | string[];
  error: string;
}
