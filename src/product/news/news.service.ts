import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { LRUCache } from 'lru-cache';
import { News, NewsStatus, NewsType } from './entities/news.entity';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsListQueryDto } from './dto/news-list-query.dto';
import { TelegramService } from 'src/integrations/telegram-integration/telegram.service';
import type { ChannelPost } from 'src/integrations/telegram-integration/telegram.service';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import type { WordpressPostsReadResult } from 'src/integrations/wordpress-integration/wordpress.service';
import { WpPublicPost } from 'src/integrations/wordpress-integration/types/wordpress.types';

export interface FeedPost {
  id: string;
  title: string;
  link: string | null;
  image: string | null;
  date: string;
  source: string;
  type: string | null;
  body: string | null;
}

export interface NewsFeedGeneration {
  posts: FeedPost[];
  complete: boolean;
}

interface CachedNewsFeed {
  posts: FeedPost[];
  generatedAt: number;
}

class IncompleteNewsFeedGenerationError extends Error {
  constructor(readonly posts: FeedPost[]) {
    super('News feed generation was incomplete');
    this.name = 'IncompleteNewsFeedGenerationError';
  }
}

class NewsFeedGenerationTimeoutError extends Error {
  constructor() {
    super('News feed generation timed out');
    this.name = 'NewsFeedGenerationTimeoutError';
  }
}

const NEWS_FEED_CACHE_KEY = 'news-feed';
const NEWS_FEED_CACHE_TTL = 10 * 60 * 1000;
const NEWS_FEED_RECOVERY_WINDOW = 20 * 60 * 1000;
const NEWS_FEED_GENERATION_TIMEOUT = 30 * 1000;

@Injectable()
export class NewsService {
  private readonly logger = new Logger('NewsService');
  private wpCache: { data: WpPublicPost[]; timestamp: number } | null = null;
  private wordpressCacheVersion = 0;
  private readonly WP_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private feedCacheVersion = 0;
  private readonly feedCache = new LRUCache<string, CachedNewsFeed>({
    max: 1,
    ttl: NEWS_FEED_CACHE_TTL,
    ttlResolution: 0,
    perf: { now: () => Date.now() },
    noDeleteOnFetchRejection: true,
    fetchMethod: () => this.generateCachedFeed(),
  });

  constructor(
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    private readonly telegramService: TelegramService,
    private readonly wordpressService: WordpressService,
  ) {}

  async create(createNewsDto: CreateNewsDto) {
    try {
      const news = this.newsRepository.create(createNewsDto);
      await this.newsRepository.save(news);
      if (createNewsDto.status === NewsStatus.PUBLISHED) {
        this.invalidateFeedCache();
      }
      return news;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: NewsListQueryDto) {
    const { limit = 10, offset = 0, status } = paginationDto;

    const where: FindOptionsWhere<News> = {};
    if (status) {
      where.status = status;
    }

    const [data, totalItems] = await this.newsRepository.findAndCount({
      take: limit,
      skip: offset,
      where,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data,
    };
  }

  async findOne(id: string) {
    try {
      const news = await this.newsRepository.findOneByOrFail({ id });
      return news;
    } catch (error) {
      throw new NotFoundException(`News with id ${id} not found`);
    }
  }

  async update(id: string, updateNewsDto: UpdateNewsDto) {
    const existingNews = await this.newsRepository.findOneBy({ id });
    if (!existingNews)
      throw new NotFoundException(`News with id ${id} not found`);

    const news = await this.newsRepository.preload({
      id,
      ...updateNewsDto,
    });

    if (!news) throw new NotFoundException(`News with id ${id} not found`);

    try {
      await this.newsRepository.save(news);
      if (this.updateAffectsPublishedFeed(existingNews, news)) {
        this.invalidateFeedCache();
      }
      return news;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const existingNews = await this.newsRepository.findOneBy({ id });
    if (!existingNews)
      throw new NotFoundException(`News with id ${id} not found`);

    const result = await this.newsRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`News with id ${id} not found`);
    }
    if (existingNews.status === NewsStatus.PUBLISHED) {
      this.invalidateFeedCache();
    }
    return { message: `News with id ${id} has been removed` };
  }

  private updateAffectsPublishedFeed(existingNews: News, updatedNews: News) {
    if (
      existingNews.status !== NewsStatus.PUBLISHED &&
      updatedNews.status !== NewsStatus.PUBLISHED
    ) {
      return false;
    }

    return (
      existingNews.status !== updatedNews.status ||
      existingNews.title !== updatedNews.title ||
      existingNews.body !== updatedNews.body ||
      existingNews.image !== updatedNews.image ||
      existingNews.type !== updatedNews.type
    );
  }

  private invalidateFeedCache() {
    this.feedCacheVersion++;
    this.feedCache.delete(NEWS_FEED_CACHE_KEY);
  }

  invalidateWordPressAndNewsFeedCaches() {
    this.wordpressCacheVersion++;
    this.wpCache = null;
    this.invalidateFeedCache();
  }

  async getFeed(): Promise<{ posts: FeedPost[] }> {
    const cacheVersion = this.feedCacheVersion;
    try {
      const cachedFeed = await this.feedCache.fetch(NEWS_FEED_CACHE_KEY);
      if (cacheVersion !== this.feedCacheVersion) {
        return this.getFeed();
      }
      if (!cachedFeed) {
        throw new Error('News feed cache returned no value');
      }
      return { posts: this.copyFeedPosts(cachedFeed.posts) };
    } catch (error) {
      if (cacheVersion !== this.feedCacheVersion) {
        return this.getFeed();
      }
      if (error instanceof IncompleteNewsFeedGenerationError) {
        const recoverableFeed = this.getRecoverableFeed();
        if (recoverableFeed) {
          return { posts: this.copyFeedPosts(recoverableFeed.posts) };
        }
        return { posts: this.copyFeedPosts(error.posts) };
      }
      if (error instanceof NewsFeedGenerationTimeoutError) {
        const recoverableFeed = this.getRecoverableFeed();
        if (recoverableFeed) {
          return { posts: this.copyFeedPosts(recoverableFeed.posts) };
        }
      }
      throw error;
    }
  }

  private copyFeedPosts(posts: FeedPost[]): FeedPost[] {
    return posts.map((post) => ({ ...post }));
  }

  private getRecoverableFeed(): CachedNewsFeed | undefined {
    const staleFeed = this.feedCache.get(NEWS_FEED_CACHE_KEY, {
      allowStale: true,
      noDeleteOnStaleGet: true,
    });
    if (!staleFeed) return undefined;

    const age = Date.now() - staleFeed.generatedAt;
    if (age > NEWS_FEED_CACHE_TTL + NEWS_FEED_RECOVERY_WINDOW) {
      return undefined;
    }
    return staleFeed;
  }

  private async generateCachedFeed(): Promise<CachedNewsFeed> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new NewsFeedGenerationTimeoutError()),
        NEWS_FEED_GENERATION_TIMEOUT,
      );
    });

    try {
      const generation = await Promise.race([
        this.getFeedGeneration(),
        timeoutPromise,
      ]);
      if (!generation.complete) {
        throw new IncompleteNewsFeedGenerationError(generation.posts);
      }
      return {
        posts: this.copyFeedPosts(generation.posts),
        generatedAt: Date.now(),
      };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  /** Internal generation metadata for callers such as the future feed cache. */
  async getFeedGeneration(): Promise<NewsFeedGeneration> {
    const [appNews, wpResult, telegramResult] = await Promise.all([
      this.newsRepository.find({
        where: { status: NewsStatus.PUBLISHED },
        order: { createdAt: 'DESC' },
        take: 2,
      }),
      this.fetchWordPressPostsWithStatus(),
      this.telegramService.getChannelPostsWithStatus('conciertosrockmetal', 6),
    ]);

    // Distribution rules
    let wpLimit: number;
    let tgLimit: number;

    if (appNews.length >= 2) {
      wpLimit = 2;
      tgLimit = 2;
    } else if (appNews.length === 1) {
      wpLimit = 3;
      tgLimit = 2;
    } else {
      wpLimit = 3;
      tgLimit = 3;
    }

    const appFeed: FeedPost[] = appNews.map((n) => ({
      id: n.id,
      title: n.title,
      link: null,
      image: n.image,
      date: n.createdAt.toISOString(),
      source: 'app',
      type: n.type,
      body: n.body,
    }));

    const wpFeed: FeedPost[] = wpResult.posts
      .slice(0, wpLimit)
      .map((post, i) => {
        let image: string | null = null;
        try {
          image = post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null;
        } catch {
          image = null;
        }

        return {
          id: `wp-${i}`,
          title: post.title?.rendered ?? '',
          link: post.link ?? null,
          image,
          date: post.date ?? new Date().toISOString(),
          source: 'riffvalley.es',
          type: null,
          body: null,
        };
      });

    const tgFeed: FeedPost[] = telegramResult.posts
      .slice(0, tgLimit)
      .map((post: ChannelPost, i) => ({
        id: `tg-${i}`,
        title: post.text,
        link: post.link,
        image: post.image,
        date: post.date ?? new Date().toISOString(),
        source: 'telegram',
        type: null,
        body: null,
      }));

    const posts = [...appFeed, ...wpFeed, ...tgFeed]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    return {
      posts,
      complete: wpResult.successful && telegramResult.successful,
    };
  }

  async getSourceFeed(filters: {
    source?: string;
    type?: NewsType;
    limit?: number;
  }): Promise<{ posts: FeedPost[] }> {
    const { source, type, limit = 6 } = filters;

    if (source === 'app') {
      const where: FindOptionsWhere<News> = {
        status: NewsStatus.PUBLISHED,
      };
      if (type) where.type = type;
      const appNews = await this.newsRepository.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
      });
      return {
        posts: appNews.map((n) => ({
          id: n.id,
          title: n.title,
          link: null,
          image: n.image,
          date: n.createdAt.toISOString(),
          source: 'app',
          type: n.type,
          body: n.body,
        })),
      };
    }

    if (source === 'riffvalley.es') {
      const wpPosts = await this.fetchWordPressPosts();
      return {
        posts: wpPosts.slice(0, limit).map((post, i) => {
          let image: string | null = null;
          try {
            image =
              post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null;
          } catch {
            image = null;
          }
          return {
            id: `wp-${i}`,
            title: post.title?.rendered ?? '',
            link: post.link ?? null,
            image,
            date: post.date ?? new Date().toISOString(),
            source: 'riffvalley.es',
            type: null,
            body: null,
          };
        }),
      };
    }

    if (source === 'telegram') {
      const tgPosts = await this.telegramService.getChannelPosts(
        'conciertosrockmetal',
        limit,
      );
      return {
        posts: tgPosts.slice(0, limit).map((post, i) => ({
          id: `tg-${i}`,
          title: post.text,
          link: post.link,
          image: post.image,
          date: post.date ?? new Date().toISOString(),
          source: 'telegram',
          type: null,
          body: null,
        })),
      };
    }

    return { posts: [] };
  }

  private async fetchWordPressPosts(): Promise<WpPublicPost[]> {
    if (
      this.wpCache &&
      Date.now() - this.wpCache.timestamp < this.WP_CACHE_TTL
    ) {
      return this.wpCache.data;
    }

    const cacheVersion = this.wordpressCacheVersion;
    try {
      const data = await this.wordpressService.getPublicPosts();
      if (data === null) return [];
      if (cacheVersion === this.wordpressCacheVersion) {
        this.wpCache = { data, timestamp: Date.now() };
      }
      return data;
    } catch (error: unknown) {
      const message =
        error !== null && typeof error === 'object' && 'message' in error
          ? error.message
          : undefined;
      this.logger.error(`Error fetching WordPress posts: ${String(message)}`);
      return [];
    }
  }

  private async fetchWordPressPostsWithStatus(): Promise<WordpressPostsReadResult> {
    if (
      this.wpCache &&
      Date.now() - this.wpCache.timestamp < this.WP_CACHE_TTL
    ) {
      return { posts: this.wpCache.data, successful: true };
    }

    const cacheVersion = this.wordpressCacheVersion;
    try {
      const result = await this.wordpressService.getPublicPostsWithStatus();
      if (!result.successful) return result;

      if (cacheVersion === this.wordpressCacheVersion) {
        this.wpCache = { data: result.posts, timestamp: Date.now() };
      }
      return result;
    } catch (error: unknown) {
      const message =
        error !== null && typeof error === 'object' && 'message' in error
          ? error.message
          : undefined;
      this.logger.error(`Error fetching WordPress posts: ${String(message)}`);
      return { posts: [], successful: false };
    }
  }

  private handleDbExceptions(error: unknown) {
    if (
      ((typeof error === 'object' && error !== null) ||
        typeof error === 'function') &&
      'code' in error &&
      error.code === '23505'
    ) {
      const detail = 'detail' in error ? error.detail : undefined;
      throw new BadRequestException(
        typeof detail === 'string' ? detail : undefined,
      );
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
