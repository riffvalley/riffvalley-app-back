import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import {
  SpotifyAccountApiService,
  SpotifyConnection,
  SpotifyInvalidGrantError,
  SpotifyOAuthApiService,
  TokenCryptoService,
} from 'src/integrations/spotify-integration';
import type { SpotifyOAuthTokenResponse } from 'src/integrations/spotify-integration';
import { MailService } from 'src/communications/mail/mail.service';

const SPOTIFY_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'ugc-image-upload',
  'user-read-private',
];
const RIFF_VALLEY_CONNECTION_KEY = 'riff-valley';
const SPOTIFY_REFRESH_TOKEN_LIFETIME_MONTHS = 6;
const SPOTIFY_REAUTHORIZATION_WARNING_DAYS = 14;

@Injectable()
export class SpotifyPlaylistAuthorizationService {
  private readonly logger = new Logger(
    SpotifyPlaylistAuthorizationService.name,
  );

  constructor(
    @InjectRepository(SpotifyConnection)
    private readonly connectionRepository: Repository<SpotifyConnection>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly mailService: MailService,
    private readonly spotifyOAuthApi: SpotifyOAuthApiService,
    private readonly spotifyAccountApi: SpotifyAccountApiService,
  ) {}

  async startSpotifyConnection() {
    const state = randomBytes(32).toString('base64url');

    let connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    if (!connection) {
      connection = this.connectionRepository.create({
        connectionKey: RIFF_VALLEY_CONNECTION_KEY,
      });
    }
    connection.oauthStateHash = this.tokenCrypto.hash(state);
    connection.oauthStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.connectionRepository.save(connection);

    return {
      authorizationUrl: this.spotifyOAuthApi.getAuthorizationUrl(
        SPOTIFY_SCOPES,
        state,
      ),
    };
  }

  async completeSpotifyConnection(code: string, state: string) {
    if (!code || !state)
      throw new BadRequestException('Faltan code o state de Spotify');

    const stateHash = this.tokenCrypto.hash(state);
    const connection = await this.connectionRepository
      .createQueryBuilder('connection')
      .addSelect([
        'connection.oauthStateHash',
        'connection.oauthStateExpiresAt',
      ])
      .where('connection.oauthStateHash = :stateHash', { stateHash })
      .getOne();

    if (
      !connection ||
      !connection.oauthStateExpiresAt ||
      connection.oauthStateExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'El estado OAuth no es válido o ha caducado',
      );
    }

    // El state sólo puede consumirse una vez, incluso si Spotify rechaza el código.
    connection.oauthStateHash = null;
    connection.oauthStateExpiresAt = null;
    await this.connectionRepository.save(connection);

    const token = await this.spotifyOAuthApi.exchangeAuthorizationCode(code);
    const profile = await this.spotifyAccountApi.getProfile(token.access_token);

    connection.spotifyUserId = profile.id;
    connection.displayName = profile.display_name;
    connection.accessToken = this.tokenCrypto.encrypt(token.access_token);
    connection.refreshToken = token.refresh_token
      ? this.tokenCrypto.encrypt(token.refresh_token)
      : connection.refreshToken;
    connection.scope = token.scope ?? SPOTIFY_SCOPES.join(' ');
    connection.expiresAt = new Date(Date.now() + token.expires_in * 1000);
    connection.authorizedAt = new Date();
    connection.refreshTokenExpiresAt = this.addUtcMonths(
      connection.authorizedAt,
      SPOTIFY_REFRESH_TOKEN_LIFETIME_MONTHS,
    );
    connection.authorizationInvalidatedAt = null;
    connection.reauthorizationReminderSentAt = null;
    await this.connectionRepository.save(connection);

    return {
      connected: true,
      spotifyUserId: connection.spotifyUserId,
      displayName: connection.displayName,
      refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
    };
  }

  async getSpotifyConnection() {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    const grantedScopes = new Set(
      (connection?.scope ?? '').split(/\s+/).filter(Boolean),
    );
    const missingScopes = SPOTIFY_SCOPES.filter(
      (scope) => !grantedScopes.has(scope),
    );
    const authorization = this.getAuthorizationState(connection);
    return {
      connected:
        authorization.status === 'connected' ||
        authorization.status === 'expiring_soon',
      spotifyUserId: connection?.spotifyUserId ?? null,
      displayName: connection?.displayName ?? null,
      canUploadImages: !missingScopes.includes('ugc-image-upload'),
      missingScopes,
      authorizationStatus: authorization.status,
      reauthorizationRequired:
        authorization.status === 'reauthorization_required',
      reauthorizationReason: authorization.reason,
      authorizedAt: connection?.authorizedAt ?? null,
      refreshTokenExpiresAt: connection?.refreshTokenExpiresAt ?? null,
      daysUntilReauthorization: authorization.daysRemaining,
    };
  }

  @Cron('0 9 * * *', { timeZone: 'Europe/Madrid' })
  async checkSpotifyAuthorizationLifetime(): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    if (
      !connection?.spotifyUserId ||
      !connection.refreshTokenExpiresAt ||
      connection.reauthorizationReminderSentAt
    ) {
      return;
    }

    const daysRemaining = this.daysUntil(connection.refreshTokenExpiresAt);
    if (daysRemaining > SPOTIFY_REAUTHORIZATION_WARNING_DAYS) return;

    try {
      const sent = await this.mailService.sendSpotifyReauthorizationReminder(
        connection.displayName,
        connection.refreshTokenExpiresAt,
        daysRemaining,
      );
      if (!sent) return;
      connection.reauthorizationReminderSentAt = new Date();
      await this.connectionRepository.save(connection);
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el aviso de reautorización de Spotify',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async disconnectSpotify() {
    await this.connectionRepository.delete({
      connectionKey: RIFF_VALLEY_CONNECTION_KEY,
    });
    return { connected: false };
  }

  async getValidAccessToken(requiredScopes: string[] = []): Promise<string> {
    const connection = await this.connectionRepository
      .createQueryBuilder('connection')
      .addSelect(['connection.accessToken', 'connection.refreshToken'])
      .where('connection.connectionKey = :connectionKey', {
        connectionKey: RIFF_VALLEY_CONNECTION_KEY,
      })
      .getOne();

    if (connection) {
      const authorization = this.getAuthorizationState(connection);
      if (authorization.status === 'reauthorization_required') {
        throw new UnauthorizedException(
          authorization.reason === 'refresh_token_invalid'
            ? 'Spotify ha invalidado la autorización. Vuelve a autorizar la cuenta'
            : 'La autorización de Spotify ha caducado. Vuelve a autorizar la cuenta',
        );
      }
    }

    if (
      !connection?.accessToken ||
      !connection.refreshToken ||
      !connection.expiresAt
    ) {
      throw new UnauthorizedException(
        'El usuario no ha conectado su cuenta de Spotify',
      );
    }

    const grantedScopes = new Set(
      (connection.scope ?? '').split(/\s+/).filter(Boolean),
    );
    const missingScopes = requiredScopes.filter(
      (scope) => !grantedScopes.has(scope),
    );
    if (missingScopes.length) {
      throw new UnauthorizedException(
        `Faltan permisos de Spotify (${missingScopes.join(', ')}). Reconecta la cuenta`,
      );
    }

    if (connection.expiresAt.getTime() > Date.now() + 60_000) {
      return this.tokenCrypto.decrypt(connection.accessToken);
    }

    let refreshed: SpotifyOAuthTokenResponse;
    try {
      refreshed = await this.spotifyOAuthApi.refreshAccessToken(
        this.tokenCrypto.decrypt(connection.refreshToken),
      );
    } catch (error) {
      if (!(error instanceof SpotifyInvalidGrantError)) throw error;
      connection.accessToken = null;
      connection.refreshToken = null;
      connection.expiresAt = null;
      connection.authorizationInvalidatedAt = new Date();
      await this.connectionRepository.save(connection);
      throw new UnauthorizedException(
        'Spotify ha invalidado la autorización. Vuelve a autorizar la cuenta',
      );
    }
    connection.accessToken = this.tokenCrypto.encrypt(refreshed.access_token);
    if (refreshed.refresh_token) {
      connection.refreshToken = this.tokenCrypto.encrypt(
        refreshed.refresh_token,
      );
    }
    connection.scope = refreshed.scope ?? connection.scope;
    connection.expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.connectionRepository.save(connection);
    return refreshed.access_token;
  }

  private getAuthorizationState(connection: SpotifyConnection | null): {
    status:
      | 'disconnected'
      | 'connected'
      | 'expiring_soon'
      | 'reauthorization_required';
    reason: 'refresh_token_expired' | 'refresh_token_invalid' | null;
    daysRemaining: number | null;
  } {
    if (!connection?.spotifyUserId || !connection.expiresAt) {
      if (connection?.authorizationInvalidatedAt) {
        return {
          status: 'reauthorization_required',
          reason: 'refresh_token_invalid',
          daysRemaining: null,
        };
      }
      return { status: 'disconnected', reason: null, daysRemaining: null };
    }

    if (connection.authorizationInvalidatedAt) {
      return {
        status: 'reauthorization_required',
        reason: 'refresh_token_invalid',
        daysRemaining: null,
      };
    }

    const daysRemaining = connection.refreshTokenExpiresAt
      ? this.daysUntil(connection.refreshTokenExpiresAt)
      : null;
    if (daysRemaining !== null && daysRemaining <= 0) {
      return {
        status: 'reauthorization_required',
        reason: 'refresh_token_expired',
        daysRemaining,
      };
    }
    if (
      daysRemaining !== null &&
      daysRemaining <= SPOTIFY_REAUTHORIZATION_WARNING_DAYS
    ) {
      return { status: 'expiring_soon', reason: null, daysRemaining };
    }
    return { status: 'connected', reason: null, daysRemaining };
  }

  private daysUntil(date: Date): number {
    return Math.max(
      0,
      Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
  }

  private addUtcMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDayOfTargetMonth = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
    return result;
  }
}
