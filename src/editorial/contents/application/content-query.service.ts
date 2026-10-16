import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { Content } from '../entities/content.entity';

@Injectable()
export class ContentQueryService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(ready?: boolean, backlog?: boolean): Promise<Content[]> {
    const where: any = {};
    if (ready !== undefined) where.ready = ready;
    if (backlog !== undefined) where.backlog = backlog;
    return this.contentRepo.find({
      where,
      relations: [
        'author',
        'list',
        'list.asignations',
        'riffValleyPlaylist',
        'riffValleyPlaylist.user',
        'article',
        'article.user',
        'article.editor',
        'video',
        'video.user',
        'video.editor',
      ],
      order: { publicationDate: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Content> {
    const content = await this.contentRepo.findOne({
      where: { id },
      relations: [
        'author',
        'list',
        'riffValleyPlaylist',
        'riffValleyPlaylist.user',
        'article',
        'article.user',
        'article.editor',
        'video',
        'video.user',
        'video.editor',
      ],
    });

    if (!content) {
      throw new NotFoundException(`Content with id ${id} not found`);
    }

    return content;
  }

  async findByMonth(year: number, month: number): Promise<Content[]> {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(lastDayOfMonth);
    endDate.setDate(endDate.getDate() + 7);

    return this.contentRepo
      .createQueryBuilder('content')
      .leftJoinAndSelect('content.author', 'author')
      .leftJoinAndSelect('content.list', 'list')
      .leftJoinAndSelect('list.asignations', 'asignations')
      .leftJoinAndSelect('content.riffValleyPlaylist', 'riffValleyPlaylist')
      .leftJoinAndSelect('riffValleyPlaylist.user', 'riffValleyPlaylistUser')
      .leftJoinAndSelect('content.article', 'article')
      .leftJoinAndSelect('article.user', 'articleUser')
      .leftJoinAndSelect('article.editor', 'articleEditor')
      .leftJoinAndSelect('content.video', 'video')
      .leftJoinAndSelect('video.user', 'videoUser')
      .leftJoinAndSelect('video.editor', 'videoEditor')
      .where('content.publicationDate >= :startDate', { startDate })
      .andWhere('content.publicationDate <= :endDate', { endDate })
      .orderBy('content.publicationDate', 'DESC')
      .getMany();
  }

  async findOneByRiffValleyPlaylistId(
    riffValleyPlaylistId: string,
  ): Promise<Content | null> {
    return this.contentRepo.findOne({
      where: { riffValleyPlaylist: { id: riffValleyPlaylistId } },
    });
  }

  async findOneByArticleId(articleId: string): Promise<Content | null> {
    return this.contentRepo.findOne({ where: { article: { id: articleId } } });
  }

  async findOneByVideoId(videoId: string): Promise<Content | null> {
    return this.contentRepo.findOne({ where: { video: { id: videoId } } });
  }

  async getDefaultAuthorId(): Promise<string> {
    const author = await this.userRepo.findOne({
      select: ['id'],
      where: {},
      order: { id: 'ASC' },
    });
    if (!author) {
      throw new NotFoundException('No default user found');
    }
    return author.id;
  }
}
