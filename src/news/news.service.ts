import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News, NewsStatus } from './entities/news.entity';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { TelegramService } from '../telegram/telegram.service';

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

@Injectable()
export class NewsService {
  private readonly logger = new Logger('NewsService');
  private wpCache: { data: any[]; timestamp: number } | null = null;
  private readonly WP_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    private readonly telegramService: TelegramService,
  ) {}

  async create(createNewsDto: CreateNewsDto) {
    try {
      const news = this.newsRepository.create(createNewsDto);
      await this.newsRepository.save(news);
      return news;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0, status } = paginationDto;

    const where: any = {};
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
    const news = await this.newsRepository.preload({
      id,
      ...updateNewsDto,
    });

    if (!news) throw new NotFoundException(`News with id ${id} not found`);

    try {
      await this.newsRepository.save(news);
      return news;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const result = await this.newsRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`News with id ${id} not found`);
    }
    return { message: `News with id ${id} has been removed` };
  }

  async getFeed(): Promise<{ posts: FeedPost[] }> {
    const [appNews, wpPosts, tgPosts] = await Promise.all([
      this.newsRepository.find({
        where: { status: NewsStatus.PUBLISHED },
        order: { createdAt: 'DESC' },
        take: 2,
      }),
      this.fetchWordPressPosts(),
      this.telegramService.getChannelPosts('conciertosrockmetal', 6),
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

    const wpFeed: FeedPost[] = wpPosts.slice(0, wpLimit).map((post, i) => {
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
    });

    const tgFeed: FeedPost[] = tgPosts.slice(0, tgLimit).map((post, i) => ({
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

    return { posts };
  }

  private async fetchWordPressPosts(): Promise<any[]> {
    if (this.wpCache && Date.now() - this.wpCache.timestamp < this.WP_CACHE_TTL) {
      return this.wpCache.data;
    }

    try {
      const response = await fetch(
        'https://riffvalley.es/wp-json/wp/v2/posts?_embed&per_page=6',
      );

      if (!response.ok) {
        this.logger.error(`Failed to fetch WordPress posts: ${response.status}`);
        return [];
      }

      const data = await response.json();
      this.wpCache = { data, timestamp: Date.now() };
      return data;
    } catch (error) {
      this.logger.error(`Error fetching WordPress posts: ${error.message}`);
      return [];
    }
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
