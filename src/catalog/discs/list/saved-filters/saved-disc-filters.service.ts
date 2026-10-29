import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import {
  CreateSavedDiscFilterDto,
  SavedDiscFilterCriteriaDto,
  UpdateSavedDiscFilterDto,
} from './dto/saved-disc-filter.dto';
import { SavedDiscFilterResponse } from './dto/saved-disc-filter-response.dto';
import {
  SavedDiscFilter,
  SavedDiscFilterCriteria,
} from './entities/saved-disc-filter.entity';

const MAX_SAVED_DISC_FILTERS = 20;

interface SavedFilterTransactionManager {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  getRepository(
    target: typeof SavedDiscFilter,
  ): Pick<Repository<SavedDiscFilter>, 'count' | 'save'>;
}

interface SavedFilterTransactionSource {
  transaction<T>(
    runInTransaction: (manager: SavedFilterTransactionManager) => Promise<T>,
  ): Promise<T>;
}

@Injectable()
export class SavedDiscFiltersService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: SavedFilterTransactionSource,
    @InjectRepository(SavedDiscFilter)
    private readonly filtersRepository: Pick<
      Repository<SavedDiscFilter>,
      'find' | 'findOne' | 'save' | 'delete'
    >,
    @InjectRepository(Genre)
    private readonly genresRepository: Pick<Repository<Genre>, 'find'>,
    @InjectRepository(Country)
    private readonly countriesRepository: Pick<Repository<Country>, 'find'>,
  ) {}

  async findAll(userId: string): Promise<SavedDiscFilterResponse[]> {
    const filters = await this.filtersRepository.find({
      where: { userId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return this.addMissingReferences(filters);
  }

  async create(
    userId: string,
    dto: CreateSavedDiscFilterDto,
  ): Promise<SavedDiscFilterResponse> {
    const filters = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT "id" FROM "users" WHERE "id" = $1 FOR UPDATE',
        [userId],
      );
      const repository = manager.getRepository(SavedDiscFilter);
      const count = await repository.count({ where: { userId } });
      if (count >= MAX_SAVED_DISC_FILTERS) {
        throw new ConflictException({
          statusCode: 409,
          message: 'A user can save at most 20 DiscList filters',
          error: 'Conflict',
          code: 'SAVED_DISC_FILTER_LIMIT_REACHED',
        });
      }

      const filter = {
        userId,
        name: dto.name.trim(),
        filters: this.normalizeCriteria(dto.filters),
      };
      return repository.save(filter);
    });
    return (await this.addMissingReferences([filters]))[0];
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSavedDiscFilterDto,
  ): Promise<SavedDiscFilterResponse> {
    if (dto.name === undefined && dto.filters === undefined) {
      throw new BadRequestException(
        'At least one saved filter field is required',
      );
    }
    const filter = await this.filtersRepository.findOne({
      where: { id, userId },
    });
    if (!filter) throw new NotFoundException('Saved DiscList filter not found');

    if (dto.name !== undefined) filter.name = dto.name.trim();
    if (dto.filters !== undefined) {
      filter.filters = this.normalizeCriteria(dto.filters);
    }
    const saved = await this.filtersRepository.save(filter);
    return (await this.addMissingReferences([saved]))[0];
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.filtersRepository.delete({ id, userId });
    if (result.affected !== 1) {
      throw new NotFoundException('Saved DiscList filter not found');
    }
  }

  private normalizeCriteria(
    criteria: SavedDiscFilterCriteriaDto,
  ): SavedDiscFilterCriteria {
    return {
      genreIds: [...criteria.genreIds].map((id) => id.toLowerCase()),
      countryId: criteria.countryId?.toLowerCase() ?? null,
      yearFrom: criteria.yearFrom ?? null,
      yearTo: criteria.yearTo ?? null,
    };
  }

  private async addMissingReferences(
    filters: SavedDiscFilter[],
  ): Promise<SavedDiscFilterResponse[]> {
    const genreIds = [
      ...new Set(filters.flatMap((filter) => filter.filters.genreIds)),
    ];
    const countryIds = [
      ...new Set(
        filters.flatMap((filter) =>
          filter.filters.countryId ? [filter.filters.countryId] : [],
        ),
      ),
    ];
    const [genres, countries] = await Promise.all([
      genreIds.length
        ? this.genresRepository.find({
            select: { id: true },
            where: { id: In(genreIds) },
          })
        : Promise.resolve([]),
      countryIds.length
        ? this.countriesRepository.find({
            select: { id: true },
            where: { id: In(countryIds) },
          })
        : Promise.resolve([]),
    ]);
    const existingGenreIds = new Set(
      genres.map((genre) => genre.id.toLowerCase()),
    );
    const existingCountryIds = new Set(
      countries.map((country) => country.id.toLowerCase()),
    );

    return filters.map((filter) => ({
      id: filter.id,
      name: filter.name,
      filters: filter.filters,
      missingGenreIds: filter.filters.genreIds.filter(
        (genreId) => !existingGenreIds.has(genreId.toLowerCase()),
      ),
      countryMissing:
        filter.filters.countryId !== null &&
        !existingCountryIds.has(filter.filters.countryId.toLowerCase()),
      createdAt: filter.createdAt,
      updatedAt: filter.updatedAt,
    }));
  }
}
