import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WpAuthor, WpEditablePost, WpPost, WpTag } from './wordpress.types';
import { WpPublicPost } from './wordpress.types';

export type { WpPost } from './wordpress.types';

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

  // Public read used by News. Keep this request anonymous: unlike the
  // publishing operations below, the posts endpoint is publicly accessible.
  async getPublicPosts(): Promise<WpPublicPost[] | null> {
    const response = await fetch(
      'https://riffvalley.es/wp-json/wp/v2/posts?_embed&per_page=6',
    );

    if (!response.ok) {
      this.logger.error(`Failed to fetch WordPress posts: ${response.status}`);
      return null;
    }

    const posts: WpPublicPost[] = await response.json();
    return posts;
  }

  async createPost(
    title: string,
    content: string,
    status: 'draft' | 'publish' = 'draft',
    meta?: Record<string, unknown>,
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
      this.logger.error(
        `Failed to create WP post: ${response.status} - ${error}`,
      );
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const post: WpPost = await response.json();
    this.logger.log(`Created WP post #${post.id}: ${title}`);
    return post;
  }

  // Devuelve null si el post fue borrado permanentemente (404), para que el
  // caller pueda auto-recuperarse en vez de reventar. Ojo: un post movido a
  // la papelera NO da 404 (WordPress lo sigue sirviendo con status "trash"),
  // por eso se expone el status y no solo el contenido.
  async getPost(
    postId: number,
  ): Promise<{ content: string; status: string } | null> {
    const res = await fetch(`${this.apiUrl}/posts/${postId}?context=edit`, {
      headers: { Authorization: `Basic ${this.credentials}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const error = await res.text();
      this.logger.error(
        `Failed to fetch WP post ${postId}: ${res.status} - ${error}`,
      );
      throw new Error(`WordPress API error: ${res.status}`);
    }
    const post: WpEditablePost = await res.json();
    return { content: post.content.raw, status: post.status };
  }

  async updatePostContent(postId: number, content: string): Promise<WpPost> {
    const response = await fetch(`${this.apiUrl}/posts/${postId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.credentials}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Failed to update WP post ${postId}: ${response.status} - ${error}`,
      );
      throw new Error(`WordPress API error: ${response.status}`);
    }

    const post: WpPost = await response.json();
    this.logger.log(`Updated WP post #${post.id}`);
    return post;
  }

  async findPostBySlug(slug: string): Promise<WpPost | null> {
    const res = await fetch(
      `${this.apiUrl}/posts?slug=${encodeURIComponent(slug)}&status=any`,
      {
        headers: { Authorization: `Basic ${this.credentials}` },
      },
    );
    const posts: WpPost[] = await res.json();
    if (!posts.length) return null;
    return {
      id: posts[0].id,
      link: posts[0].link,
      title: posts[0].title,
      status: posts[0].status,
    };
  }

  async findAuthorBySlug(slug: string): Promise<WpAuthor | null> {
    const res = await fetch(
      `${this.apiUrl}/users?slug=${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Basic ${this.credentials}` } },
    );
    if (!res.ok) return null;
    const users: WpAuthor[] = await res.json();
    if (!users.length) return null;
    return { id: users[0].id, name: users[0].name, link: users[0].link };
  }

  async getOrCreateTag(name: string): Promise<number> {
    const searchRes = await fetch(
      `${this.apiUrl}/tags?search=${encodeURIComponent(name)}&per_page=5`,
      { headers: { Authorization: `Basic ${this.credentials}` } },
    );
    const found: WpTag[] = await searchRes.json();
    const exact = found.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (exact) return exact.id;

    const createRes = await fetch(`${this.apiUrl}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.credentials}`,
      },
      body: JSON.stringify({ name }),
    });
    const created: WpTag = await createRes.json();
    return created.id;
  }
}
