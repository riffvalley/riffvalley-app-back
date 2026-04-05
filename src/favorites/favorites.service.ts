import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateFavoriteDto } from './dto/create-favorites.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './entities/favorite.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';
// Importamos la entidad Pending para poder hacer el join
import { Pending } from 'src/pendings/entities/pending.entity';
import {
  applyOrder,
  parseOrdersRaw,
} from 'src/common/helpers/apply-order.helper';

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger('FavoritesService');

  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
  ) { }

  async create(createFavoriteDto: CreateFavoriteDto, user: User) {
    try {
      const { discId, ...favoriteData } = createFavoriteDto;
      const disc = await this.favoriteRepository.manager.findOne(Disc, {
        where: { id: discId },
      });

      if (!disc) {
        throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      const favorite = this.favoriteRepository.create({
        ...favoriteData,
        user,
        disc, // Se asigna la entidad Disc encontrada
      });

      await this.favoriteRepository.save(favorite);
      return favorite;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAllByUser(paginationDto: PaginationDto, user: User) {
    const { limit = 10, offset = 0, query, dateRange, genre, country } = paginationDto;
    const userId = user.id;

    // Manejo del rango de fechas
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (dateRange && dateRange.length === 2) {
      [startDate, endDate] = dateRange;
    }

    // Construimos el query para los favorites y añadimos el join con pending
    const queryBuilder = this.favoriteRepository
      .createQueryBuilder('favorite')
      .leftJoinAndSelect('favorite.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('disc.genre', 'genre')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoin(
        'rate',
        'rate',
        'rate.discId = disc.id AND rate.userId = :userId',
        { userId },
      )
      .leftJoin(
        Pending,
        'pending',
        'pending.discId = disc.id AND pending.userId = :userId',
        { userId },
      )
      .addSelect('rate.id', 'rateId')
      .addSelect('rate.rate', 'userRate')
      .addSelect('rate.cover', 'userCover')
      .addSelect('pending.id', 'pendingId')
      .addSelect('rate.rate', 'rate_rate')
      .addSelect('rate.cover', 'rate_cover')

      // Agrega el conteo de votos para cada disco
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(rate.id)', 'rateCount')
          .from('rate', 'rate')
          .where('rate.discId = disc.id AND rate.rate IS NOT NULL');
      }, 'rateCount')
      // Agrega el conteo de comentarios para cada disco
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(comment.id)', 'commentCount')
          .from('comment', 'comment')
          .where('comment.discId = disc.id');
      }, 'commentCount')
      .where('favorite.userId = :userId', { userId });

    // Subqueries para cálculos de promedios (en caso de necesitarse)
    queryBuilder
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.rate)', 'averageRate')
          .from('rate', 'rate')
          .where('rate.discId = disc.id AND rate.rate IS NOT NULL');
      }, 'averageRate')
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.cover)', 'averageCover')
          .from('rate', 'rate')
          .where('rate.discId = disc.id AND rate.cover IS NOT NULL');
      }, 'averageCover');

    // Filtros según el rango de fechas, búsqueda y género
    if (startDate && endDate) {
      queryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    if (query) {
      const search = `%${query}%`;
      queryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name ILIKE :search)',
        { search },
      );
    }

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (country) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(country);
      if (isUUID) {
        queryBuilder.andWhere('country.id = :country', { country });
      } else {
        queryBuilder.andWhere('country.name = :country', { country });
      }
    }
    const ALLOWED_ORDER_FIELDS = new Set<string>([
      // columnas reales/relaciones
      'disc.releaseDate',
      'disc.name',
      'artist.name',
      'favorite.createdAt',
      // campos del join de rate del propio usuario
      'rate.rate',
      'rate.cover',
      // aliases calculados / subselects
      'averageRate',
      'averageCover',
      'rateCount',
      'commentCount',
      // opcional: si prefieres ordenar por el alias seleccionado arriba
      'userRate',
    ]);

    const orders = parseOrdersRaw(paginationDto.orderBy, {
      allowlist: ALLOWED_ORDER_FIELDS,
      defaultDirection: 'ASC',
    });

    queryBuilder.take(limit).skip(offset);

    applyOrder(queryBuilder, orders, [
      { field: 'disc.releaseDate', direction: 'DESC', nulls: 'NULLS LAST' },
      { field: 'artist.name', direction: 'ASC' },
    ]);

    const { entities: favorites, raw } = await queryBuilder.getRawAndEntities();

    // Procesamos los resultados para incluir la información de rate y pending
    const processedFavorites = favorites.map((favorite, index) => ({
      ...favorite,
      disc: {
        ...favorite.disc,
        artist: {
          ...favorite.disc.artist,
          country: favorite.disc.artist?.country || null,
        },
        userFavorite: { id: favorite.id },
        voteCount: parseInt(raw[index].rateCount, 10) || null,
        commentCount: parseInt(raw[index].commentCount, 10) || 0,
        userRate: raw[index].rateId
          ? {
            id: raw[index].rateId,
            rate: raw[index].userRate,
            cover: raw[index].userCover,
          }
          : null,
        userPending: raw[index].pendingId ? { id: raw[index].pendingId } : null,
        averageRate: raw[index].averageRate != null ? parseFloat(raw[index].averageRate) : null,
        averageCover: raw[index].averageCover != null ? parseFloat(raw[index].averageCover) : null,
      },
    }));

    // Construimos el query para obtener el total de elementos
    const totalItemsQueryBuilder = this.favoriteRepository
      .createQueryBuilder('favorite')
      .leftJoin('favorite.disc', 'disc')
      .leftJoin('disc.artist', 'artist')
      .leftJoin('artist.country', 'country')
      .leftJoin('disc.genre', 'genre')
      .leftJoin(
        'rate',
        'rate',
        'rate.discId = disc.id AND rate.userId = :userId',
        { userId },
      )
      .addSelect('rate.rate', 'rate_rate')
      .addSelect('rate.cover', 'rate_cover')
      .leftJoin(
        Pending,
        'pending',
        'pending.discId = disc.id AND pending.userId = :userId',
        { userId },
      )
      .where('favorite.userId = :userId', { userId });

    if (startDate && endDate) {
      totalItemsQueryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    if (query) {
      const search = `%${query}%`;
      totalItemsQueryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name ILIKE :search)',
        { search },
      );
    }

    if (genre) {
      totalItemsQueryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (country) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(country);
      if (isUUID) {
        totalItemsQueryBuilder.andWhere('country.id = :country', { country });
      } else {
        totalItemsQueryBuilder.andWhere('country.name = :country', { country });
      }
    }

    const totalItems = await totalItemsQueryBuilder.getCount();
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: processedFavorites,
    };
  }

  async findOne(id: string): Promise<Favorite> {
    try {
      const favorite = await this.favoriteRepository.findOneByOrFail({ id });
      return favorite;
    } catch (error) {
      throw new NotFoundException(`Favorite with id ${id} not found`);
    }
  }

  async remove(id: string) {
    const result = await this.favoriteRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Favorite with id ${id} not found`);
    }
    return { message: `Favorite with id ${id} has been removed` };
  }

  private handleDbExceptions(error: any) {
    // Por ejemplo, error.code === '23505' en PostgreSQL para entradas duplicadas
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
