import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateRateDto } from './dto/create-rates.dto';
import { UpdateRateDto } from './dto/update-rates.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from './entities/rate.entity';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Pending } from 'src/community/pendings/entities/pending.entity';
import {
  applyOrder,
  parseOrdersRaw,
} from 'src/common/helpers/apply-order.helper';

@Injectable()
export class RatesService {
  private readonly logger = new Logger('RatesService');

  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    // private readonly discRespository: Repository<Disc>,
  ) { }

  async create(createRateDto: CreateRateDto, user: User) {
    try {
      const { discId, ...rateData } = createRateDto;
      const disc = await this.rateRepository.manager.findOne(Disc, {
        where: { id: discId },
      });

      if (!disc) {
        throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      // Check if rate already exists for this user and disc
      const existingRate = await this.rateRepository.findOne({
        where: {
          user: { id: user.id },
          disc: { id: discId }
        }
      });

      if (existingRate) {
        // Update existing rate
        const updatedRate = await this.rateRepository.preload({
          id: existingRate.id,
          ...rateData,
          editedAt: new Date()
        });

        await this.rateRepository.save(updatedRate);
        return updatedRate;
      }

      // Create new rate if it doesn't exist
      const newRate = this.rateRepository.create({
        ...rateData,
        user,
        disc,
      });

      await this.rateRepository.save(newRate);
      return newRate;
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
      type,
      country,
    } = paginationDto;
    const userId = user.id;

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (dateRange && dateRange.length === 2) {
      [startDate, endDate] = dateRange;
    }

    const queryBuilder = this.rateRepository
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.disc', 'disc') // Relación con los discos
      .leftJoinAndSelect('disc.artist', 'artist') // Relación con los artistas
      .leftJoinAndSelect('disc.genre', 'genre') // Relación con los géneros
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoin(
        Pending,
        'pending',
        'pending.discId = disc.id AND pending.userId = :userId',
        { userId },
      )
      .leftJoin(
        'favorite',
        'favorite',
        'favorite.discId = disc.id AND favorite.userId = :userId',
        { userId },
      ) // Relación con los favoritos del usuario
      .addSelect('favorite.id', 'favoriteId') // Obtener el ID del favorito
      .addSelect('pending.id', 'pendingId')
      .where('rate.userId = :userId', { userId });

    // Cálculo de promedios
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
      }, 'averageCover')
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
      }, 'commentCount');

    const totalItemsQueryBuilder = this.rateRepository
      .createQueryBuilder('rate')
      .leftJoin('rate.disc', 'disc')
      .leftJoin('disc.artist', 'artist')
      .leftJoin('artist.country', 'country')
      .leftJoin('disc.genre', 'genre')
      .where('rate.userId = :userId', { userId });

    if (type === 'rate') {
      queryBuilder.andWhere('rate.rate IS NOT NULL');
      totalItemsQueryBuilder.andWhere('rate.rate IS NOT NULL');
    } else if (type === 'cover') {
      queryBuilder.andWhere('rate.cover IS NOT NULL');
      totalItemsQueryBuilder.andWhere('rate.cover IS NOT NULL');
    }

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

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
      totalItemsQueryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (country) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(country);
      if (isUUID) {
        queryBuilder.andWhere('country.id = :country', { country });
        totalItemsQueryBuilder.andWhere('country.id = :country', { country });
      } else {
        queryBuilder.andWhere('country.name = :country', { country });
        totalItemsQueryBuilder.andWhere('country.name = :country', { country });
      }
    }

    const ALLOWED_ORDER_FIELDS = new Set<string>([
      // columnas reales
      'disc.releaseDate',
      'disc.name',
      'artist.name',
      'rate.createdAt',
      'rate.editedAt',
      'rate.rate', // 👈 tu voto
      'rate.cover', // 👈 tu voto de portada
      // FIXME: aliases calculados (subselects ya añadidos arriba)
      'averageRate',
      'averageCover',
      'rateCount',
      'commentCount',
    ]);

    const orders = parseOrdersRaw(paginationDto.orderBy, {
      allowlist: ALLOWED_ORDER_FIELDS, // mapa alias->col
      defaultDirection: 'ASC',
    });

    queryBuilder.take(limit).skip(offset);

    applyOrder(queryBuilder, orders, [
      { field: 'disc.releaseDate', direction: 'DESC', nulls: 'NULLS LAST' },
      { field: 'artist.name', direction: 'ASC' },
    ]);

    const { entities: rates, raw } = await queryBuilder.getRawAndEntities();

    // Procesar los resultados para incluir el ID del favorito
    const processedRates = rates.map((rate, index) => ({
      ...rate,
      disc: {
        ...rate.disc,
        artist: {
          ...rate.disc.artist,
          country: rate.disc.artist?.country || null,
        },
        userRate: {
          rate: rate.rate,
          cover: rate.cover,
          id: rate.id,
        },
        voteCount: parseInt(raw[index].rateCount, 10) || null,
        commentCount: parseInt(raw[index].commentCount, 10) || 0,
        averageRate: raw[index].averageRate != null ? parseFloat(raw[index].averageRate) : null,
        averageCover: raw[index].averageCover != null ? parseFloat(raw[index].averageCover) : null,
        favoriteId: raw[index].favoriteId || null, // Agregar el ID del favorito si existe
        pendingId: raw[index].pendingId || null,
      },
    }));

    // Obtener el total de elementos

    // **Filtrar según el valor de "genre" en paginationDto**

    const totalItems = await totalItemsQueryBuilder.getCount();
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: processedRates,
    };
  }

  async findOne(id: string, user: User): Promise<Rate> {
    try {
      const rate = await this.rateRepository.findOneOrFail({
        where: { id },
        relations: ['user'],
      });
      if (rate.user.id !== user.id) {
        throw new ForbiddenException('You can only access your own rates');
      }
      return rate;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(`Rate with id ${id} not found`);
    }
  }

  async update(id: string, updateRateDto: UpdateRateDto, user: User) {
    const existing = await this.rateRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!existing) {
      throw new NotFoundException(`Rate with id ${id} not found`);
    }

    if (existing.user.id !== user.id) {
      throw new ForbiddenException('You can only edit your own rates');
    }

    const rate = await this.rateRepository.preload({
      id,
      ...updateRateDto,
      editedAt: new Date(),
    });

    try {
      await this.rateRepository.save(rate);
      return rate;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string, user: User) {
    const existing = await this.rateRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!existing) {
      throw new NotFoundException(`Rate with id ${id} not found`);
    }

    if (existing.user.id !== user.id) {
      throw new ForbiddenException('You can only delete your own rates');
    }

    await this.rateRepository.delete({ id });
    return { message: `Rate with id ${id} has been removed` };
  }

  private handleDbExceptions(error: any) {
    if (error instanceof HttpException) {
      throw error;
    }
    // Ej. error.code === '23505' en postgres para entradas duplicadas
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }

  async findRatesByDisc(discId: string) {
    try {
      // Verificamos si el disco existe
      const disc = await this.rateRepository.manager.findOne(Disc, {
        where: { id: discId },
      });

      if (!disc) {
        throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      // Obtenemos todos los rates asociados al disco
      const rates = await this.rateRepository.find({
        where: { disc: { id: discId } },
        relations: ['user'], // Incluye los usuarios en la consulta
      });

      return rates;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }


}
