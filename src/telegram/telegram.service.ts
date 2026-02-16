import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface ChannelPost {
  id: string;
  text: string;
  image: string | null;
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

      let image: string | null = null;
      const photoStyle = $el
        .find('.tgme_widget_message_photo_wrap')
        .attr('style');
      if (photoStyle) {
        const match = photoStyle.match(/background-image:url\('([^']+)'\)/);
        if (match) {
          image = match[1];
        }
      }

      const date =
        $el.find('.tgme_widget_message_date time').attr('datetime') || null;

      const link = `https://t.me/${channel}/${id}`;

      posts.push({ id, text, image, date, link });
    });

    return posts.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }
}
