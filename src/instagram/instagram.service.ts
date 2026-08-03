import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { InstagramCarouselChild, InstagramMediaType, InstagramPost } from './entities/instagram-post.entity';
import { InstagramPostsQueryDto } from './dto/instagram-posts-query.dto';

interface IgMediaNode {
  id: string;
  caption?: string;
  media_type: InstagramMediaType;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  children?: {
    data: { id: string; media_url?: string; media_type: string }[];
  };
}

interface IgMediaResponse {
  data: IgMediaNode[];
  paging?: { next?: string };
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly graphApiVersion = process.env.IG_GRAPH_API_VERSION || 'v21.0';
  // Los tokens que emite el dashboard de Meta para esta app ya son de
  // larga duración (60 días); se cachean en memoria y se renuevan por
  // cron para no depender de reiniciar el proceso con un token nuevo a mano.
  private accessToken = process.env.IG_ACCESS_TOKEN || '';

  constructor(
    @InjectRepository(InstagramPost)
    private readonly instagramPostRepository: Repository<InstagramPost>,
  ) {}

  // Cada 10 min por defecto: además de traer posts nuevos, refresca
  // media_url/thumbnail_url de los ya guardados porque la Graph API los
  // sirve como URLs firmadas con caducidad, no enlaces permanentes.
  @Cron(process.env.IG_SYNC_CRON || '*/10 * * * *')
  async syncPosts() {
    const businessAccountId = process.env.IG_BUSINESS_ACCOUNT_ID;

    if (!this.accessToken || !businessAccountId) {
      this.logger.warn(
        'IG_ACCESS_TOKEN or IG_BUSINESS_ACCOUNT_ID is not set, skipping Instagram sync',
      );
      return;
    }

    try {
      let url =
        `https://graph.instagram.com/${this.graphApiVersion}/${businessAccountId}/media` +
        `?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type}` +
        `&limit=50&access_token=${this.accessToken}`;

      let syncedCount = 0;
      const maxPages = 20;

      for (let page = 0; url && page < maxPages; page++) {
        const res = await fetch(url);
        const body = (await res.json()) as IgMediaResponse & { error?: any };

        if (!res.ok || body.error) {
          this.logger.error(
            `Instagram API error: ${JSON.stringify(body.error ?? body)}`,
          );
          break;
        }

        for (const node of body.data) {
          const children: InstagramCarouselChild[] | null =
            node.children?.data.map((child) => ({
              id: child.id,
              mediaUrl: child.media_url ?? '',
              mediaType: child.media_type,
            })) ?? null;

          await this.instagramPostRepository.upsert(
            {
              igMediaId: node.id,
              caption: node.caption ?? null,
              mediaType: node.media_type,
              mediaProductType: node.media_product_type ?? null,
              mediaUrl: node.media_url ?? '',
              thumbnailUrl: node.thumbnail_url ?? null,
              children,
              permalink: node.permalink,
              igTimestamp: new Date(node.timestamp),
            },
            ['igMediaId'],
          );
          syncedCount++;
        }

        url = body.paging?.next ?? '';
      }

      this.logger.log(`Instagram sync finished: ${syncedCount} posts upserted`);
    } catch (error) {
      this.logger.error(`Instagram sync failed: ${error}`);
    }
  }

  // Los tokens de la Instagram API duran 60 días pero se pueden renovar en
  // cualquier momento pasadas 24h desde su emisión, extendiendo otros 60
  // días. Renovar semanalmente evita quedarnos sin token por olvido.
  @Cron('0 4 * * 0', { timeZone: 'Europe/Madrid' })
  async refreshAccessToken() {
    if (!this.accessToken) {
      return;
    }

    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${this.accessToken}`,
      );
      const body = (await res.json()) as { access_token?: string; error?: any };

      if (!res.ok || !body.access_token) {
        this.logger.error(
          `Instagram token refresh failed: ${JSON.stringify(body.error ?? body)}`,
        );
        return;
      }

      this.accessToken = body.access_token;
      await this.persistAccessToken(body.access_token);
      this.logger.log('Instagram access token refreshed');
    } catch (error) {
      this.logger.error(`Instagram token refresh failed: ${error}`);
    }
  }

  // En Heroku el filesystem es efímero: un .env escrito a mano no sobrevive
  // a un restart/redeploy del dyno. Si hay credenciales de la Heroku
  // Platform API, persistimos ahí para que el token sobreviva; si no
  // (entorno local), caemos al .env de siempre.
  private async persistAccessToken(token: string) {
    const herokuApiKey = process.env.IG_HEROKU_API_TOKEN;
    const herokuAppName = process.env.IG_HEROKU_APP_NAME;

    if (herokuApiKey && herokuAppName) {
      try {
        const res = await fetch(
          `https://api.heroku.com/apps/${herokuAppName}/config-vars`,
          {
            method: 'PATCH',
            headers: {
              Accept: 'application/vnd.heroku+json; version=3',
              Authorization: `Bearer ${herokuApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ IG_ACCESS_TOKEN: token }),
          },
        );

        if (!res.ok) {
          this.logger.error(
            `Could not persist refreshed Instagram token to Heroku config vars: ${res.status} ${await res.text()}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Could not persist refreshed Instagram token to Heroku config vars: ${error}`,
        );
      }
      return;
    }

    const envPath = path.join(process.cwd(), '.env');

    try {
      const contents = fs.readFileSync(envPath, 'utf8');
      const updated = contents.includes('IG_ACCESS_TOKEN=')
        ? contents.replace(/^IG_ACCESS_TOKEN=.*$/m, `IG_ACCESS_TOKEN=${token}`)
        : `${contents}\nIG_ACCESS_TOKEN=${token}\n`;
      fs.writeFileSync(envPath, updated);
    } catch (error) {
      this.logger.error(`Could not persist refreshed Instagram token to .env: ${error}`);
    }
  }

  async findPosts(dto: InstagramPostsQueryDto) {
    const { limit = 12, offset = 0 } = dto;

    const [data, totalItems] = await this.instagramPostRepository.findAndCount({
      order: { igTimestamp: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      data,
      totalItems,
      hasMore: offset + data.length < totalItems,
    };
  }
}
