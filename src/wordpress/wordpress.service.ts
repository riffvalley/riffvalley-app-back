import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WpPost {
  id: number;
  link: string;
  title: { rendered: string };
  status: string;
}

@Injectable()
export class WordpressService {
  private readonly logger = new Logger('WordpressService');
  private readonly apiUrl: string;
  private readonly credentials: string;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.get<string>('WP_USER', '');
    const password = this.configService.get<string>('WP_APP_PASSWORD', '');
    this.apiUrl = this.configService.get<string>(
      'WP_API_URL',
      'https://riffvalley.es/wp-json/wp/v2',
    );
    this.credentials = Buffer.from(`${user}:${password}`).toString('base64');
  }

  async createPost(
    title: string,
    content: string,
    status: 'draft' | 'publish' = 'draft',
    meta?: Record<string, any>,
    categories?: number[],
    tags?: number[],
    slug?: string,
  ): Promise<WpPost> {
    const response = await fetch(`${this.apiUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.credentials}`,
      },
      body: JSON.stringify({
        title,
        content,
        status,
        ...(meta ? { meta } : {}),
        ...(categories?.length ? { categories } : {}),
        ...(tags?.length ? { tags } : {}),
        ...(slug ? { slug } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to create WP post: ${response.status} - ${error}`);
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const post: WpPost = await response.json();
    this.logger.log(`Created WP post #${post.id}: ${title}`);
    return post;
  }

  async getOrCreateTag(name: string): Promise<number> {
    const searchRes = await fetch(
      `${this.apiUrl}/tags?search=${encodeURIComponent(name)}&per_page=5`,
      { headers: { Authorization: `Basic ${this.credentials}` } },
    );
    const found: any[] = await searchRes.json();
    const exact = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;

    const createRes = await fetch(`${this.apiUrl}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.credentials}`,
      },
      body: JSON.stringify({ name }),
    });
    const created: any = await createRes.json();
    return created.id;
  }
}
