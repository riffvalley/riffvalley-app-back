import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, QueryFailedError, Repository } from 'typeorm';
import { Article, ArticleStatus } from './entities/article.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { ContentType } from 'src/editorial/contents/entities/content.entity';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

export interface FindArticleParams {
  limit?: number;
  offset?: number;
  q?: string;
  status?: ArticleStatus;
  userId?: string;
}

const ARTICLE_USER_FOREIGN_KEY_CONSTRAINTS = new Set([
  'FK_636f17dadfea1ffb4a412296a28', // userId
  'FK_021ce4f1155af87f1a27d9ec54a', // editorId
  'FK_29740ddc0b7f0af9ed816db0f7a', // coauthorId
]);

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly repo: Repository<Article>,
    @Inject(forwardRef(() => ContentsService))
    private readonly contentsService: ContentsService,
  ) {}

  async create(createArticleDto: CreateArticleDto): Promise<Article> {
    this.validateStatusRequirements(
      createArticleDto.status,
      Boolean(createArticleDto.userId),
      createArticleDto.updateDate,
      'create',
    );

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
    const savedArticle = await this.saveArticle(entity);

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
      this.validateStatusRequirements(
        updateArticleDto.status,
        Boolean(entity.user),
        updateArticleDto.updateDate,
        'update',
      );

      if (updateArticleDto.status === ArticleStatus.PUBLISHED) {
        entity.updateDate = new Date(updateArticleDto.updateDate!);
      }
    }

    if (updateArticleDto.status) entity.status = updateArticleDto.status;

    await this.saveArticle(entity);

    return this.findOne(id);
  }

  private validateStatusRequirements(
    status: ArticleStatus,
    hasUser: boolean,
    updateDate: string | Date | null | undefined,
    operation: 'create' | 'update',
  ): void {
    if (
      (status === ArticleStatus.EDITING || status === ArticleStatus.READY) &&
      !hasUser
    ) {
      throw new BadRequestException(
        operation === 'create'
          ? `Para crear un artículo en estado "${status}", debe tener un usuario asignado.`
          : `Para cambiar el estado a "${status}", el artículo debe tener un usuario asignado.`,
      );
    }

    if (status === ArticleStatus.PUBLISHED && !updateDate) {
      throw new BadRequestException(
        operation === 'create'
          ? 'Para crear un artículo en estado "published", debe proporcionar una fecha (updateDate).'
          : 'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
      );
    }
  }

  private async saveArticle(article: Article): Promise<Article> {
    try {
      return await this.repo.save(article);
    } catch (error) {
      if (this.isArticleUserForeignKeyViolation(error)) {
        throw new NotFoundException(
          'One or more assigned users were not found',
        );
      }

      throw error;
    }
  }

  private isArticleUserForeignKeyViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError = error.driverError as Error & {
      code?: string;
      table?: string;
      constraint?: string;
    };

    return (
      driverError.code === '23503' &&
      driverError.table === 'article' &&
      ARTICLE_USER_FOREIGN_KEY_CONSTRAINTS.has(driverError.constraint ?? '')
    );
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
