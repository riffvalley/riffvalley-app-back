import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comments.dto';
import { UpdateCommentDto } from './dto/update-comments.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CommunityListQueryDto } from '../common/dto/community-list-query.dto';
import { DiscListReaderSort } from '../common/types/disc-list-reader-criteria';
import { User } from 'src/identity/auth/entities/user.entity';
import { applyDiscListFilters } from 'src/community/common/helpers/apply-disc-list-filters';
import {
  DiscListOptionsCriteria,
  DiscListOptionsResult,
} from 'src/community/common/types/disc-list-options';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { CommentResponseDto } from './dto/comment-response.dto';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger('CommentsService');

  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    // Si es necesario, se puede inyectar también el repositorio de Disc
    // private readonly discRepository: Repository<Disc>,
  ) {}

  async findDiscListOptions(
    criteria: DiscListOptionsCriteria,
    user: User,
  ): Promise<DiscListOptionsResult> {
    const createQuery = (omitCountry: boolean, omitGenre: boolean) => {
      const query = this.commentRepository
        .createQueryBuilder('comment')
        .innerJoin('comment.disc', 'disc')
        .leftJoin('disc.artist', 'artist')
        .leftJoin('artist.country', 'country')
        .leftJoin('disc.genre', 'genre')
        .where('comment.userId = :userId', { userId: user.id })
        .andWhere('comment.comment IS NOT NULL');
      applyDiscListFilters(query, criteria, {
        omitCountry,
        omitGenre,
        countryColumn: 'artist.countryId',
      });
      return query;
    };

    const [countries, genres] = await Promise.all([
      createQuery(true, false)
        .select('country.id', 'id')
        .addSelect('country.name', 'name')
        .addSelect('country.isoCode', 'isoCode')
        .andWhere('country.id IS NOT NULL')
        .distinct(true)
        .orderBy('country.name', 'ASC')
        .addOrderBy('country.id', 'ASC')
        .getRawMany<DiscListOptionsResult['countries'][number]>(),
      createQuery(false, true)
        .select('genre.id', 'id')
        .addSelect('genre.name', 'name')
        .addSelect('genre.color', 'color')
        .andWhere('genre.id IS NOT NULL')
        .distinct(true)
        .orderBy('genre.name', 'ASC')
        .addOrderBy('genre.id', 'ASC')
        .getRawMany<DiscListOptionsResult['genres'][number]>(),
    ]);
    return { countries, genres };
  }

  async create(createCommentDto: CreateCommentDto, user: User) {
    try {
      const { discId, parentId, ...commentData } = createCommentDto;

      // Buscar el disco por el ID proporcionado
      const disc = await this.commentRepository.manager.findOne(Disc, {
        where: { id: discId },
      });
      if (!disc) {
        throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      // Si se proporciona un parentId, buscar el comentario padre
      let parent = null;
      if (parentId) {
        parent = await this.commentRepository.findOne({
          where: { id: parentId },
        });
        if (!parent) {
          throw new NotFoundException(
            `Parent comment with id ${parentId} not found`,
          );
        }
      }

      // Crear el comentario asignando el usuario, el disco y (si corresponde) el comentario padre
      const comment = this.commentRepository.create({
        ...commentData,
        user,
        disc,
        parent,
      });

      await this.commentRepository.save(comment);
      return comment;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAllByUser(
    paginationDto: CommunityListQueryDto,
    user: User,
    options?: {
      stableTieBreak: boolean;
      includeCountry: boolean;
      sort?: DiscListReaderSort;
    },
  ) {
    const {
      limit = 10,
      offset = 0,
      query,
      dateRange,
      genre,
      country,
      type,
    } = paginationDto;
    const userId = user.id;

    const queryBuilder = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('disc.genre', 'genre')
      .where('comment.userId = :userId', { userId });

    if (options?.includeCountry) {
      queryBuilder.leftJoinAndSelect('artist.country', 'country');
    }

    const totalItemsQueryBuilder = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoin('comment.disc', 'disc')
      .leftJoin('disc.artist', 'artist')
      .leftJoin('disc.genre', 'genre')
      .where('comment.userId = :userId', { userId });

    if (type === 'comment') {
      queryBuilder.andWhere('comment.comment IS NOT NULL');
      totalItemsQueryBuilder.andWhere('comment.comment IS NOT NULL');
    }

    const discListFilters = {
      query,
      dateRange,
      countryId: country,
      genreId: genre,
    };
    applyDiscListFilters(queryBuilder, discListFilters, {
      countryColumn: 'artist.countryId',
    });
    applyDiscListFilters(totalItemsQueryBuilder, discListFilters, {
      countryColumn: 'artist.countryId',
    });

    queryBuilder.take(limit).skip(offset);

    if (options?.stableTieBreak) {
      const order = this.getDiscListOrder(options.sort);
      queryBuilder.orderBy(order.field, order.direction);
      if (order.field !== 'disc.releaseDate') {
        queryBuilder.addOrderBy('disc.releaseDate', 'DESC');
      }
      queryBuilder.addOrderBy('artist.name', 'ASC');
      queryBuilder.addOrderBy('comment.id', 'ASC');
    } else {
      queryBuilder
        .orderBy('disc.releaseDate', 'DESC')
        .addOrderBy('artist.name', 'ASC');
    }

    const comments = await queryBuilder.getMany();
    const totalItems = await totalItemsQueryBuilder.getCount();
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: comments,
    };
  }

  private getDiscListOrder(sort?: DiscListReaderSort): {
    field: string;
    direction: 'ASC' | 'DESC';
  } {
    switch (sort) {
      case 'releaseDateAsc':
        return { field: 'disc.releaseDate', direction: 'ASC' };
      case 'createdAtAsc':
        return { field: 'comment.createdAt', direction: 'ASC' };
      case 'createdAtDesc':
        return { field: 'comment.createdAt', direction: 'DESC' };
      default:
        return { field: 'disc.releaseDate', direction: 'DESC' };
    }
  }

  async findOne(id: string, user: User): Promise<Comment> {
    try {
      const comment = await this.commentRepository.findOneOrFail({
        where: { id },
        relations: ['user'],
      });
      this.assertOwner(comment, user);
      return comment;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(`Comment with id ${id} not found`);
    }
  }

  async update(id: string, updateCommentDto: UpdateCommentDto, user: User) {
    const existing = await this.commentRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!existing) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }
    this.assertOwner(existing, user);

    const comment = await this.commentRepository.preload({
      id,
      ...updateCommentDto,
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }

    try {
      await this.commentRepository.save(comment);
      return comment;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string, user: User) {
    // Se buscan las relaciones necesarias, por ejemplo, 'replies'
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['replies', 'user'],
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }
    this.assertOwner(comment, user);

    // Verificamos si el comentario tiene respuestas
    if (comment.replies && comment.replies.length > 0) {
      // Tiene relaciones, se realiza soft delete
      comment.isDeleted = true;
      comment.comment = 'Comentario eliminado';
      await this.commentRepository.save(comment);
      return {
        message: `Comment with id ${id} has been marked as deleted (soft delete)`,
      };
    } else {
      // No tiene relaciones dependientes, se realiza hard delete
      await this.commentRepository.delete(id);
      return { message: `Comment with id ${id} has been permanently deleted` };
    }
  }

  private assertOwner(comment: Comment, user: User) {
    if (comment.user.id !== user.id) {
      throw new ForbiddenException('You can only access your own comments');
    }
  }

  async findCommentsByDisc(discId: string): Promise<CommentResponseDto[]> {
    try {
      // Verificar que el disco exista
      const disc = await this.commentRepository.manager.findOne(Disc, {
        where: { id: discId },
      });

      if (!disc) {
        throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      const comments = await this.commentRepository.find({
        where: { disc: { id: discId } },
        relations: ['user', 'parent', 'disc'],
      });

      const response = comments.map((comment) => {
        const {
          parent,
          user,
          disc,
          comment: text,
          isDeleted,
          ...rest
        } = comment;

        return {
          ...rest,
          // Devolvemos el flag real
          isDeleted,
          // Si está eliminado, devolvemos un texto fijo; en caso contrario, el original
          comment: isDeleted ? 'Comentario eliminado' : text,
          parentId: parent ? parent.id : null,
          user: {
            id: user.id,
            username: user.username,
            image: user.image,
          },
          disc: {
            id: disc.id,
            name: disc.name,
          },
        } as CommentResponseDto;
      });

      return response;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  private handleDbExceptions(error: unknown) {
    if (error instanceof HttpException) {
      throw error;
    }
    // Ejemplo: error.code === '23505' en Postgres para entradas duplicadas
    if (isUniqueConstraintError(error)) {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}

function isUniqueConstraintError(
  error: unknown,
): error is { code: '23505'; detail?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    (!('detail' in error) || typeof error.detail === 'string')
  );
}
