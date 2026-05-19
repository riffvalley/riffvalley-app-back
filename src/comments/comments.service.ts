import {
  BadRequestException,
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
import { PaginationDto } from '../common/dtos/pagination.dto';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';
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

  async findAllByUser(paginationDto: PaginationDto, user: User) {
    const {
      limit = 10,
      offset = 0,
      query,
      dateRange,
      genre,
      country,
      type,
    } = paginationDto as any;
    const userId = user.id;

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (dateRange && dateRange.length === 2) {
      [startDate, endDate] = dateRange;
    }

    const queryBuilder = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('disc.genre', 'genre')
      .where('comment.userId = :userId', { userId });

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

    // Filtro por fecha de lanzamiento del disco
    if (startDate && endDate) {
      queryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
      totalItemsQueryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    // Filtro por query (nombre del disco o del artista)
    if (query) {
      const search = `%${query}%`;
      queryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name ILIKE :search)',
        { search },
      );
      totalItemsQueryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name ILIKE :search)',
        { search },
      );
    }

    // Filtro por género
    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
      totalItemsQueryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (country) {
      queryBuilder.andWhere('artist.countryId = :country', { country });
      totalItemsQueryBuilder.andWhere('artist.countryId = :country', { country });
    }

    queryBuilder
      .take(limit)
      .skip(offset)
      .orderBy('disc.releaseDate', 'DESC')
      .addOrderBy('artist.name', 'ASC');

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

  async findOne(id: string): Promise<Comment> {
    try {
      const comment = await this.commentRepository.findOneByOrFail({ id });
      return comment;
    } catch (error) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }
  }

  async update(id: string, updateCommentDto: UpdateCommentDto) {
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

  async remove(id: string) {
    // Se buscan las relaciones necesarias, por ejemplo, 'replies'
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['replies'],
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }

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

  private handleDbExceptions(error: any) {
    // Ejemplo: error.code === '23505' en Postgres para entradas duplicadas
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
