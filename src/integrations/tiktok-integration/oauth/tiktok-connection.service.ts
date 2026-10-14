import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { MailService } from 'src/communications/mail/mail.service';
import { TiktokConnection } from './tiktok-connection.entity';
import {
  TiktokApiService,
  TiktokInvalidGrantError,
  TiktokTokenResponse,
} from '../api/tiktok-api.service';
import { TiktokTokenCryptoService } from './token-crypto.service';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_SCOPES = ['user.info.basic', 'video.list'];
const RIFF_VALLEY_CONNECTION_KEY = 'riff-valley';
const TIKTOK_REAUTHORIZATION_WARNING_DAYS = 14;

@Injectable()
export class TiktokConnectionService {
  // Preserve the log context used by the connection cron before extraction.
  private readonly logger = new Logger('TiktokService');

  constructor(
    @InjectRepository(TiktokConnection)
    private readonly connectionRepository: Repository<TiktokConnection>,
    private readonly configService: ConfigService,
    private readonly tiktokApi: TiktokApiService,
    private readonly tokenCrypto: TiktokTokenCryptoService,
    private readonly mailService: MailService,
  ) {}

  async startConnection() {
    const clientKey = this.requiredConfig('TIKTOK_CLIENT_KEY');
    const redirectUri = this.requiredConfig('TIKTOK_REDIRECT_URI');
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

    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: TIKTOK_SCOPES.join(','),
      state,
    });

    return { authorizationUrl: `${TIKTOK_AUTH_URL}?${params}` };
  }

  async completeConnection(code: string, state: string) {
    if (!code || !state)
      throw new BadRequestException('Faltan code o state de TikTok');

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

    // Consume state before the provider exchange, as the existing flow does.
    connection.oauthStateHash = null;
    connection.oauthStateExpiresAt = null;
    await this.connectionRepository.save(connection);

    const token = await this.exchangeAuthorizationCode(code);
    const profile = await this.tiktokApi.fetchUserInfo(token.access_token);

    connection.openId = profile?.open_id ?? token.open_id;
    connection.displayName = profile?.display_name ?? null;
    connection.accessToken = this.tokenCrypto.encrypt(token.access_token);
    connection.refreshToken = token.refresh_token
      ? this.tokenCrypto.encrypt(token.refresh_token)
      : connection.refreshToken;
    connection.scope = token.scope ?? TIKTOK_SCOPES.join(',');
    connection.expiresAt = new Date(Date.now() + token.expires_in * 1000);
    connection.authorizedAt = new Date();
    connection.refreshTokenExpiresAt = new Date(
      Date.now() + token.refresh_expires_in * 1000,
    );
    connection.authorizationInvalidatedAt = null;
    connection.reauthorizationReminderSentAt = null;
    await this.connectionRepository.save(connection);

    return {
      connected: true,
      openId: connection.openId,
      displayName: connection.displayName,
      refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
    };
  }

  async getConnection() {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    const grantedScopes = new Set(
      (connection?.scope ?? '').split(/[,\s]+/).filter(Boolean),
    );
    const missingScopes = TIKTOK_SCOPES.filter(
      (scope) => !grantedScopes.has(scope),
    );
    const authorization = this.getAuthorizationState(connection);
    return {
      connected:
        authorization.status === 'connected' ||
        authorization.status === 'expiring_soon',
      openId: connection?.openId ?? null,
      displayName: connection?.displayName ?? null,
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

  async disconnect() {
    await this.connectionRepository.delete({
      connectionKey: RIFF_VALLEY_CONNECTION_KEY,
    });
    return { connected: false };
  }

  // TikTok refresh tokens expire after the lifetime reported by `refresh_expires_in`.
  @Cron('0 9 * * *', { timeZone: 'Europe/Madrid' })
  async checkAuthorizationLifetime(): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    if (
      !connection?.openId ||
      !connection.refreshTokenExpiresAt ||
      connection.reauthorizationReminderSentAt
    ) {
      return;
    }

    const daysRemaining = this.daysUntil(connection.refreshTokenExpiresAt);
    if (daysRemaining > TIKTOK_REAUTHORIZATION_WARNING_DAYS) return;

    try {
      const sent = await this.mailService.sendTiktokReauthorizationReminder(
        connection.displayName,
        connection.refreshTokenExpiresAt,
        daysRemaining,
      );
      if (!sent) return;
      connection.reauthorizationReminderSentAt = new Date();
      await this.connectionRepository.save(connection);
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el aviso de reautorización de TikTok',
        error instanceof Error ? error.stack : String(error),
      );
    }
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
            ? 'TikTok ha invalidado la autorización. Vuelve a autorizar la cuenta'
            : 'La autorización de TikTok ha caducado. Vuelve a autorizar la cuenta',
        );
      }
    }

    if (
      !connection?.accessToken ||
      !connection.refreshToken ||
      !connection.expiresAt
    ) {
      throw new UnauthorizedException('No se ha conectado la cuenta de TikTok');
    }

    const grantedScopes = new Set(
      (connection.scope ?? '').split(/[,\s]+/).filter(Boolean),
    );
    const missingScopes = requiredScopes.filter(
      (scope) => !grantedScopes.has(scope),
    );
    if (missingScopes.length) {
      throw new UnauthorizedException(
        `Faltan permisos de TikTok (${missingScopes.join(', ')}). Reconecta la cuenta`,
      );
    }

    if (connection.expiresAt.getTime() > Date.now() + 60_000) {
      return this.tokenCrypto.decrypt(connection.accessToken);
    }

    let refreshed: TiktokTokenResponse;
    try {
      refreshed = await this.tiktokApi.refreshAccessToken(
        this.tokenCrypto.decrypt(connection.refreshToken),
      );
    } catch (error) {
      if (!(error instanceof TiktokInvalidGrantError)) throw error;
      connection.accessToken = null;
      connection.refreshToken = null;
      connection.expiresAt = null;
      connection.authorizationInvalidatedAt = new Date();
      await this.connectionRepository.save(connection);
      throw new UnauthorizedException(
        'TikTok ha invalidado la autorización. Vuelve a autorizar la cuenta',
      );
    }
    connection.accessToken = this.tokenCrypto.encrypt(refreshed.access_token);
    if (refreshed.refresh_token) {
      // TikTok rotates refresh tokens; persist the replacement for next time.
      connection.refreshToken = this.tokenCrypto.encrypt(
        refreshed.refresh_token,
      );
    }
    connection.scope = refreshed.scope ?? connection.scope;
    connection.expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    if (refreshed.refresh_expires_in) {
      connection.refreshTokenExpiresAt = new Date(
        Date.now() + refreshed.refresh_expires_in * 1000,
      );
    }
    await this.connectionRepository.save(connection);
    return refreshed.access_token;
  }

  private async exchangeAuthorizationCode(
    code: string,
  ): Promise<TiktokTokenResponse> {
    return this.tiktokApi.exchangeAuthorizationCode(
      code,
      this.requiredConfig('TIKTOK_REDIRECT_URI'),
    );
  }

  private getAuthorizationState(connection: TiktokConnection | null): {
    status:
      | 'disconnected'
      | 'connected'
      | 'expiring_soon'
      | 'reauthorization_required';
    reason: 'refresh_token_expired' | 'refresh_token_invalid' | null;
    daysRemaining: number | null;
  } {
    if (!connection?.openId || !connection.expiresAt) {
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
      daysRemaining <= TIKTOK_REAUTHORIZATION_WARNING_DAYS
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

  private requiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value)
      throw new InternalServerErrorException(`${name} no está configurada`);
    return value;
  }
}
