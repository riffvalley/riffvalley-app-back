import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WpAuthor,
  WpEditablePost,
  WpPost,
  WpTag,
  WpPublicPost,
} from './types/wordpress.types';

export type { WpPost } from './types/wordpress.types';

export type WordpressWriteOutcome = 'rejected' | 'unknown';

export interface WordpressPostsReadResult {
  posts: WpPublicPost[];
  successful: boolean;
}

export class WordpressWriteError extends Error {
  constructor(
    message: string,
    readonly outcome: WordpressWriteOutcome,
    readonly status?: number,
    readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'WordpressWriteError';
  }
}

function sanitizeWordpressDiagnostic(value: string): string {
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

function getWordpressErrorDetails(responseBody: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return '';
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return '';
  }

  const error = parsed as Record<string, unknown>;
  const details = [
    typeof error.code === 'string' && error.code
      ? `code=${sanitizeWordpressDiagnostic(error.code)}`
      : undefined,
    typeof error.message === 'string' && error.message
      ? `message=${sanitizeWordpressDiagnostic(error.message)}`
      : undefined,
  ].filter((value): value is string => value !== undefined);

  return details.join(' ');
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

  // Public read used by News. Keep this request anonymous: unlike the
  // publishing operations below, the posts endpoint is publicly accessible.
  async getPublicPosts(): Promise<WpPublicPost[] | null> {
    const { posts } = await this.requestPublicPosts();
    return posts as WpPublicPost[] | null;
  }

  /** Internal News read that also reports whether the provider payload is usable. */
  async getPublicPostsWithStatus(): Promise<WordpressPostsReadResult> {
    try {
      const response = await this.requestPublicPosts();
      if (!response.successful) {
        return { posts: [], successful: false };
      }
      if (
        !Array.isArray(response.posts) ||
        !response.posts.every((post: unknown) => this.isPublicPost(post))
      ) {
        this.logger.error('Invalid WordPress public posts response');
        return { posts: [], successful: false };
      }

      return { posts: response.posts, successful: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching WordPress posts: ${message}`);
      return { posts: [], successful: false };
    }
  }

  private async requestPublicPosts(): Promise<{
    posts: unknown | null;
    successful: boolean;
  }> {
    const response = await fetch(
      'https://riffvalley.es/wp-json/wp/v2/posts?_embed&per_page=6',
    );

    if (!response.ok) {
      this.logger.error(`Failed to fetch WordPress posts: ${response.status}`);
      return { posts: null, successful: false };
    }

    return { posts: await response.json(), successful: true };
  }

  private isPublicPost(value: unknown): value is WpPublicPost {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const post = value as Record<string, unknown>;
    if (
      post.title === undefined &&
      post.link === undefined &&
      post.date === undefined
    ) {
      return false;
    }
    if (
      !this.isOptionalString(post.link) ||
      !this.isOptionalString(post.date)
    ) {
      return false;
    }

    if (post.title !== undefined) {
      if (
        typeof post.title !== 'object' ||
        post.title === null ||
        Array.isArray(post.title)
      ) {
        return false;
      }
      const title = post.title as Record<string, unknown>;
      if (!this.isOptionalString(title.rendered)) return false;
    }

    if (post._embedded !== undefined) {
      if (
        typeof post._embedded !== 'object' ||
        post._embedded === null ||
        Array.isArray(post._embedded)
      ) {
        return false;
      }
      const embedded = post._embedded as Record<string, unknown>;
      const media = embedded['wp:featuredmedia'];
      if (
        media !== undefined &&
        (!Array.isArray(media) ||
          !media.every((item: unknown) => this.isFeaturedMedia(item)))
      ) {
        return false;
      }
    }

    return true;
  }

  private isFeaturedMedia(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const media = value as Record<string, unknown>;
    return this.isOptionalString(media.source_url);
  }

  private isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === 'string';
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
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/posts`, {
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
    } catch (error) {
      throw new WordpressWriteError(
        error instanceof Error ? error.message : 'WordPress request failed',
        'unknown',
        undefined,
        error,
      );
    }

    if (!response.ok) {
      let error = '';
      try {
        error = await response.text();
      } catch {
        // El status HTTP basta para clasificar el resultado aunque falle leer
        // el cuerpo de error.
      }
      this.logHttpError('Failed to create WP post', response.status, error);
      throw new WordpressWriteError(
        `WordPress API error: ${response.status}`,
        response.status >= 500 ? 'unknown' : 'rejected',
        response.status,
      );
    }

    let post: WpPost;
    try {
      post = await response.json();
    } catch (error) {
      throw new WordpressWriteError(
        'WordPress created the post but returned an unreadable response',
        'unknown',
        response.status,
        error,
      );
    }
    if (!post || typeof post.id !== 'number' || typeof post.link !== 'string') {
      throw new WordpressWriteError(
        'WordPress created the post but returned incomplete publication identity',
        'unknown',
        response.status,
      );
    }
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
      this.logHttpError(`Failed to fetch WP post ${postId}`, res.status, error);
      throw new Error(`WordPress API error: ${res.status}`);
    }
    const post: WpEditablePost = await res.json();
    return { content: post.content.raw, status: post.status };
  }

  async updatePostContent(postId: number, content: string): Promise<WpPost> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/posts/${postId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.credentials}`,
        },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      throw new WordpressWriteError(
        error instanceof Error ? error.message : 'WordPress request failed',
        'unknown',
        undefined,
        error,
      );
    }

    if (!response.ok) {
      let error = '';
      try {
        error = await response.text();
      } catch {
        // El status HTTP basta para clasificar el resultado aunque falle leer
        // el cuerpo de error.
      }
      this.logHttpError(
        `Failed to update WP post ${postId}`,
        response.status,
        error,
      );
      throw new WordpressWriteError(
        `WordPress API error: ${response.status}`,
        response.status >= 500 ? 'unknown' : 'rejected',
        response.status,
      );
    }

    let post: WpPost;
    try {
      post = await response.json();
    } catch (error) {
      throw new WordpressWriteError(
        'WordPress updated the post but returned an unreadable response',
        'unknown',
        response.status,
        error,
      );
    }
    if (!post || typeof post.id !== 'number') {
      throw new WordpressWriteError(
        'WordPress updated the post but returned incomplete publication identity',
        'unknown',
        response.status,
      );
    }
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
    if (!res.ok) {
      const error = await res.text();
      this.logHttpError(
        `Failed to find WordPress post by slug ${slug}`,
        res.status,
        error,
      );
      throw new Error(`WordPress API error: ${res.status}`);
    }
    const posts: WpPost[] = await res.json();
    if (!Array.isArray(posts)) {
      throw new Error('WordPress returned an invalid slug lookup response');
    }
    if (!posts.length) return null;
    if (
      typeof posts[0]?.id !== 'number' ||
      typeof posts[0]?.link !== 'string'
    ) {
      throw new Error('WordPress returned an incomplete slug lookup response');
    }
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

  private logHttpError(
    operation: string,
    status: number,
    responseBody: string,
  ): void {
    const details = getWordpressErrorDetails(responseBody);
    this.logger.error(
      `${operation}: ${status}${details ? ` - ${details}` : ''}`,
    );
  }
}
