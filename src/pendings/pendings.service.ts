import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePendingDto } from './dto/create-pendings.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pending } from './entities/pending.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';

@Injectable()
export class PendingsService {
  private readonly logger = new Logger('PendingsService');

  constructor(
    @InjectRepository(Pending)
    private readonly pendingRepository: Repository<Pending>,
  ) { }

  async create(createPendingDto: CreatePendingDto, user: User) {
    try {
      const { discId, ...pendingData } = createPendingDto;
      const disc = await this.pendingRepository.manager.findOne(Disc, {
        where: { id: discId },
      });

      if (!disc) {
        throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      const pending = this.pendingRepository.create({
        ...pendingData,
        user,
        disc, // Se asigna la entidad Disc encontrada
      });

      await this.pendingRepository.save(pending);
      return pending;
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

    // Construimos el query para los pendings y añadimos los joins similares a FavoritesService
    const queryBuilder = this.pendingRepository
      .createQueryBuilder('pending')
      .leftJoinAndSelect('pending.disc', 'disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('disc.genre', 'genre')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoin(
        'rate',
        'rate',
        'rate.discId = disc.id AND rate.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect(
        'disc.favorites',
        'favorite',
        'favorite.userId = :userId',
        { userId },
      )
      .addSelect('rate.id', 'rateId')
      .addSelect('rate.rate', 'userRate')
      .addSelect('rate.cover', 'userCover')
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
      .where('pending.userId = :userId', { userId });

    // Subconsultas para promedios (rate y cover)
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

    // Filtros según fecha, búsqueda y género
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

    queryBuilder
      .take(limit)
      .skip(offset)
      .orderBy('disc.releaseDate', 'DESC')
      .addOrderBy('artist.name', 'ASC');

    const { entities: pendings, raw } = await queryBuilder.getRawAndEntities();

    // Procesamos los resultados para incluir los datos de rate y el detalle del pending
    const processedPendings = pendings.map((pending, index) => ({
      ...pending,
      disc: {
        ...pending.disc,
        artist: {
          ...pending.disc.artist,
          country: pending.disc.artist?.country || null,
        },
        userPending: pending.id,
        voteCount: parseInt(raw[index].rateCount, 10) || null,
        commentCount: parseInt(raw[index].commentCount, 10) || 0,
        userRate: raw[index].rateId
          ? {
            id: raw[index].rateId,
            rate: raw[index].userRate,
            cover: raw[index].userCover,
          }
          : null,
        averageRate: raw[index].averageRate
          ? parseFloat(raw[index].averageRate)
          : null,
        averageCover: raw[index].averageCover
          ? parseFloat(raw[index].averageCover)
          : null,
        favoriteId:
          pending.disc.favorites.length > 0
            ? pending.disc.favorites[0].id
            : null, // Enviar el ID del favorito si existe
      },
    }));

    // Construimos el query para obtener el total de elementos
    const totalItemsQueryBuilder = this.pendingRepository
      .createQueryBuilder('pending')
      .leftJoin('pending.disc', 'disc')
      .leftJoin('disc.artist', 'artist')
      .leftJoin('artist.country', 'country')
      .leftJoin('disc.genre', 'genre')
      .where('pending.userId = :userId', { userId });

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
      data: processedPendings,
    };
  }

  async findOne(id: string): Promise<Pending> {
    try {
      const pending = await this.pendingRepository.findOneByOrFail({ id });
      return pending;
    } catch (error) {
      throw new NotFoundException(`Pending with id ${id} not found`);
    }
  }

  async remove(id: string) {
    const result = await this.pendingRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Pending with id ${id} not found`);
    }
    return { message: `Pending with id ${id} has been removed` };
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
