import {
  BadGatewayException,
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
import { MailService } from 'src/mail/mail.service';
import { TiktokConnection } from './entities/tiktok-connection.entity';
import { TiktokVideo } from './entities/tiktok-video.entity';
import { TiktokTokenCryptoService } from './token-crypto.service';
import { TiktokVideosQueryDto } from './dto/tiktok-videos-query.dto';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';
const TIKTOK_SCOPES = ['user.info.basic', 'video.list'];
const RIFF_VALLEY_CONNECTION_KEY = 'riff-valley';
const TIKTOK_REAUTHORIZATION_WARNING_DAYS = 14;
const TIKTOK_VIDEO_FIELDS = [
  'id',
  'title',
  'video_description',
  'duration',
  'cover_image_url',
  'embed_link',
  'embed_html',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
  'create_time',
].join(',');

class TiktokInvalidGrantError extends Error {}

interface TiktokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

interface TiktokUserInfoResponse {
  data?: { user?: { open_id: string; display_name?: string | null } };
  error?: { code: string; message: string; log_id: string };
}

interface TiktokVideoNode {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  embed_link?: string;
  embed_html?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
  create_time?: number;
}

interface TiktokVideoListResponse {
  data?: { videos?: TiktokVideoNode[]; cursor?: number; has_more?: boolean };
  error?: { code: string; message: string; log_id: string };
}

// La Display API de TikTok siempre incluye un objeto `error` en la respuesta,
// incluso cuando la llamada ha ido bien (con code: "ok"). Solo es un fallo
// real si el code es distinto de "ok".
function isTiktokError(error?: {
  code: string;
  message: string;
  log_id: string;
}): boolean {
  return !!error && error.code !== 'ok';
}

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(
    @InjectRepository(TiktokConnection)
    private readonly connectionRepository: Repository<TiktokConnection>,
    @InjectRepository(TiktokVideo)
    private readonly videoRepository: Repository<TiktokVideo>,
    private readonly configService: ConfigService,
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

    // El state sólo puede consumirse una vez, incluso si TikTok rechaza el código.
    connection.oauthStateHash = null;
    connection.oauthStateExpiresAt = null;
    await this.connectionRepository.save(connection);

    const token = await this.exchangeAuthorizationCode(code);
    const profile = await this.fetchUserInfo(token.access_token);

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

  // TikTok emite refresh_token con validez de 365 días (indicada por la propia
  // API en refresh_expires_in). Avisamos con antelación para no perder la
  // sincronización por olvido de reautorizar.
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

  // Cada 10 min por defecto: trae vídeos nuevos y refresca contadores
  // (visualizaciones, likes...) de los ya guardados.
  @Cron(process.env.TIKTOK_SYNC_CRON || '*/10 * * * *')
  async syncVideos() {
    let accessToken: string;
    try {
      accessToken = await this.getValidAccessToken(['video.list']);
    } catch (error) {
      this.logger.warn(
        `TikTok sync omitido: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }

    try {
      let cursor: number | undefined;
      let hasMore = true;
      let syncedCount = 0;
      const maxPages = 20;

      for (let page = 0; hasMore && page < maxPages; page++) {
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
        const body = (await response.json()) as TiktokVideoListResponse;

        if (!response.ok || isTiktokError(body.error)) {
          this.logger.error(
            `TikTok API error: ${JSON.stringify(body.error ?? body)}`,
          );
          break;
        }

        for (const node of body.data?.videos ?? []) {
          await this.videoRepository.upsert(
            {
              tiktokVideoId: node.id,
              title: node.title ?? null,
              videoDescription: node.video_description ?? null,
              coverImageUrl: node.cover_image_url ?? null,
              embedLink: node.embed_link ?? null,
              embedHtml: node.embed_html ?? null,
              duration: node.duration ?? null,
              viewCount: node.view_count ?? null,
              likeCount: node.like_count ?? null,
              commentCount: node.comment_count ?? null,
              shareCount: node.share_count ?? null,
              tiktokCreateTime: new Date((node.create_time ?? 0) * 1000),
            },
            ['tiktokVideoId'],
          );
          syncedCount++;
        }

        hasMore = body.data?.has_more ?? false;
        cursor = body.data?.cursor;
      }

      this.logger.log(`TikTok sync finished: ${syncedCount} videos upserted`);
    } catch (error) {
      this.logger.error(`TikTok sync failed: ${error}`);
    }
  }

  async findVideos(dto: TiktokVideosQueryDto) {
    const { limit = 12, offset = 0 } = dto;

    const [data, totalItems] = await this.videoRepository.findAndCount({
      order: { tiktokCreateTime: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      data,
      totalItems,
      hasMore: offset + data.length < totalItems,
    };
  }

  private async getValidAccessToken(
    requiredScopes: string[] = [],
  ): Promise<string> {
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
      refreshed = await this.refreshAccessToken(
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
      // TikTok rota el refresh_token en cada uso: si no persistimos el nuevo,
      // el siguiente intento de refresco fallaría con invalid_grant.
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
    return this.tiktokTokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.requiredConfig('TIKTOK_REDIRECT_URI'),
      }),
    );
  }

  private async refreshAccessToken(
    refreshToken: string,
  ): Promise<TiktokTokenResponse> {
    return this.tiktokTokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
  }

  // A diferencia de Spotify, TikTok espera client_key/client_secret en el
  // body del POST, no en la cabecera Authorization: Basic.
  private async tiktokTokenRequest(
    body: URLSearchParams,
  ): Promise<TiktokTokenResponse> {
    body.set('client_key', this.requiredConfig('TIKTOK_CLIENT_KEY'));
    body.set('client_secret', this.requiredConfig('TIKTOK_CLIENT_SECRET'));

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

  private async fetchUserInfo(
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
        `No se pudo obtener el perfil de TikTok: ${JSON.stringify(body.error ?? body)}`,
      );
      return null;
    }
    return {
      open_id: body.data.user.open_id,
      display_name: body.data.user.display_name ?? null,
    };
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
