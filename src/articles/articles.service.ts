import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Article, ArticleStatus } from './entities/article.entity';
import { ContentsService } from 'src/contents/contents.service';
import { ContentType } from 'src/contents/entities/content.entity';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

export interface FindArticleParams {
  limit?: number;
  offset?: number;
  q?: string;
  status?: ArticleStatus;
  userId?: string;
}

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly repo: Repository<Article>,
    @Inject(forwardRef(() => ContentsService))
    private readonly contentsService: ContentsService,
  ) {}

  async create(createArticleDto: CreateArticleDto): Promise<Article> {
    const entity = this.repo.create({
      ...createArticleDto,
      updateDate: createArticleDto.updateDate
        ? new Date(createArticleDto.updateDate)
        : null,
      user: createArticleDto.userId
        ? { id: createArticleDto.userId }
        : undefined,
      editor: createArticleDto.editorId
        ? { id: createArticleDto.editorId }
        : undefined,
      coauthor: createArticleDto.coauthorId
        ? { id: createArticleDto.coauthorId }
        : undefined,
    });
    const savedArticle = await this.repo.save(entity);

    return this.findOne(savedArticle.id);
  }

  async findAll(params: FindArticleParams = {}): Promise<Article[]> {
    const { limit = 50, offset = 0, q, status, userId } = params;

    const baseWhere: any = {};

    if (status) baseWhere.status = status;
    if (q) baseWhere.name = ILike(`%${q}%`);

    const where = userId
      ? [
          { ...baseWhere, user: { id: userId } },
          { ...baseWhere, editor: { id: userId } },
          { ...baseWhere, coauthor: { id: userId } },
        ]
      : baseWhere;

    return this.repo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: Math.min(Math.max(0, limit), 200),
      skip: Math.max(0, offset),
      relations: ['user', 'content', 'editor', 'coauthor'],
    });
  }

  async findOne(id: string): Promise<Article> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['user', 'content', 'editor', 'coauthor'],
    });
    if (!entity) throw new NotFoundException('Article not found');
    return entity;
  }

  async update(
    id: string,
    updateArticleDto: UpdateArticleDto,
  ): Promise<Article> {
    const entity = await this.findOne(id);

    // Update simple fields
    if (updateArticleDto.name) entity.name = updateArticleDto.name;
    if (updateArticleDto.link) entity.link = updateArticleDto.link;
    if (updateArticleDto.type) entity.type = updateArticleDto.type;
    if (updateArticleDto.updateDate) {
      entity.updateDate = new Date(updateArticleDto.updateDate);
    }

    // Handle User Assignment
    if (updateArticleDto.userId) {
      entity.user = { id: updateArticleDto.userId } as any;
    }

    if (updateArticleDto.coauthorId) {
      entity.coauthor = { id: updateArticleDto.coauthorId } as any;
    }

    if (updateArticleDto.editorId) {
      entity.editor = { id: updateArticleDto.editorId } as any;
    }

    // Logic for State Transitions
    // NOTE: this no longer touches Content — Article and Content are fully
    // independent. Creating/linking a Content is a manual, explicit action
    // (see createContentForArticle() / POST /articles/:id/content).
    if (updateArticleDto.status && updateArticleDto.status !== entity.status) {
      if (
        updateArticleDto.status === ArticleStatus.EDITING ||
        updateArticleDto.status === ArticleStatus.READY
      ) {
        if (!entity.user) {
          throw new BadRequestException(
            `Para cambiar el estado a "${updateArticleDto.status}", el artículo debe tener un usuario asignado.`,
          );
        }
      } else if (updateArticleDto.status === ArticleStatus.PUBLISHED) {
        if (!updateArticleDto.updateDate) {
          throw new BadRequestException(
            'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
          );
        }
        entity.updateDate = new Date(updateArticleDto.updateDate);
      }
    }

    if (updateArticleDto.status) entity.status = updateArticleDto.status;

    await this.repo.save(entity);

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);

    const content = await this.contentsService.findOneByArticleId(id);
    if (content) {
      throw new BadRequestException(
        'No se puede eliminar un Article que tiene un Content asociado. Elimina primero ese Content (DELETE /contents/:id).',
      );
    }

    await this.repo.remove(entity);
  }

  /**
   * Manual "create content" button: creates a backlog Content (no
   * publicationDate) linked to this Article and stops there — Article and
   * Content stay fully independent afterwards, no further sync happens.
   */
  async createContentForArticle(id: string): Promise<Article> {
    const article = await this.findOne(id);

    if (article.content) {
      throw new BadRequestException(
        'Este Article ya tiene un Content asociado.',
      );
    }
    if (!article.user) {
      throw new BadRequestException(
        'Para crear el Content asociado, el artículo debe tener un usuario asignado.',
      );
    }

    await this.contentsService.create({
      name: article.name,
      type: ContentType.ARTICLE,
      authorId: article.user.id,
      articleId: article.id,
      backlog: true,
    } as any);

    return this.findOne(id);
  }
}
