import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface ChannelPost {
  id: string;
  text: string;
  image: string | null;
  // Todas las fotos si el mensaje es un álbum agrupado; con una sola foto
  // coincide con `image`. `image` se mantiene para no romper a quien ya
  // lo consume esperando un único string.
  images: string[];
  date: string | null;
  link: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger('TelegramService');
  private readonly cache = new Map<
    string,
    { data: ChannelPost[]; timestamp: number }
  >();
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  async getChannelPosts(
    channel: string,
    limit: number,
  ): Promise<ChannelPost[]> {
    const cacheKey = channel;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data.slice(0, limit);
    }

    try {
      const response = await fetch(`https://t.me/s/${channel}`);

      if (!response.ok) {
        this.logger.error(
          `Failed to fetch Telegram channel: ${response.status}`,
        );
        return [];
      }

      const html = await response.text();
      const posts = this.parseChannelHtml(html, channel);

      this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });

      return posts.slice(0, limit);
    } catch (error) {
      this.logger.error(`Error fetching Telegram channel: ${error.message}`);
      return [];
    }
  }

  // Paginación por cursor para scroll infinito: t.me/s/{canal} solo admite
  // "before=<id de mensaje>" para pedir la tanda anterior, no un offset.
  async getChannelPostsPage(
    channel: string,
    limit: number,
    before?: string,
  ): Promise<{ data: ChannelPost[]; nextBefore: string | null; hasMore: boolean }> {
    const cacheKey = `${channel}:${before ?? 'latest'}`;
    const cached = this.cache.get(cacheKey);

    let posts: ChannelPost[];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      posts = cached.data;
    } else {
      try {
        const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
          this.logger.error(
            `Failed to fetch Telegram channel page: ${response.status}`,
          );
          return { data: [], nextBefore: null, hasMore: false };
        }

        const html = await response.text();
        posts = this.parseChannelHtml(html, channel);
        this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });
      } catch (error) {
        this.logger.error(`Error fetching Telegram channel page: ${error.message}`);
        return { data: [], nextBefore: null, hasMore: false };
      }
    }

    const data = posts.slice(0, limit);
    const nextBefore = data.length > 0 ? data[data.length - 1].id : null;

    // t.me no confirma cuántos posts quedan: el tamaño del lote lo decide
    // Telegram, no `limit`. La única señal fiable de "no hay más" es que
    // una página devuelva 0 posts, así que no podemos cortar solo porque
    // esta tanda traiga menos de `limit`.
    return { data, nextBefore, hasMore: data.length > 0 };
  }

  private parseChannelHtml(html: string, channel: string): ChannelPost[] {
    const $ = cheerio.load(html);
    const posts: ChannelPost[] = [];

    $('.tgme_widget_message_wrap').each((_, element) => {
      const $el = $(element);
      const dataPost = $el
        .find('[data-post]')
        .attr('data-post');

      if (!dataPost) return;

      const id = dataPost.split('/').pop();
      if (!id) return;

      const text =
        $el
          .find('.tgme_widget_message_text')
          .text()
          .trim()
          .substring(0, 200) || '';

      const images: string[] = [];
      $el.find('.tgme_widget_message_photo_wrap').each((__, photoEl) => {
        const style = $(photoEl).attr('style');
        const match = style?.match(/background-image:url\('([^']+)'\)/);
        if (match) {
          images.push(match[1]);
        }
      });

      const date =
        $el.find('.tgme_widget_message_date time').attr('datetime') || null;

      const link = `https://t.me/${channel}/${id}`;

      posts.push({ id, text, image: images[0] ?? null, images, date, link });
    });

    return posts.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }
}
