import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { Locality } from './entities/locality.entity';
import { Venue } from './entities/venue.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenuesQueryDto } from './dto/venues-query.dto';
import { ResolveVenuesBatchDto } from './dto/resolve-venues-batch.dto';
import { ImportVenuesBatchDto } from './dto/import-venues-batch.dto';
import { ImportVenueRowDto } from './dto/import-venue-row.dto';
import { normalizeGeography } from '../geography/helpers/normalize-geography';

interface VenueMapRow {
  id: string;
  name: string;
  type: string;
  locality: string;
  province: string | null;
  region: string;
  country: string;
  latitude: number | string | null;
  longitude: number | string | null;
  precision: 'venue' | 'locality' | 'unavailable';
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
    @InjectRepository(Locality)
    private readonly localityRepository: Repository<Locality>,
  ) {}

  async create(dto: CreateVenueDto): Promise<Venue> {
    this.ensureCoordinatePair(dto.latitude, dto.longitude);
    await this.ensureLocality(dto.localityId);
    try {
      return await this.persistVenue(dto);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async getOrCreateGenericVenue(
    localityId: string,
    manager?: EntityManager,
  ): Promise<Venue> {
    const result = await this.getOrCreateGenericVenueWithStatus(
      localityId,
      manager,
    );
    return result.venue;
  }

  async getOrCreateGenericVenueWithStatus(
    localityId: string,
    manager?: EntityManager,
  ): Promise<{ venue: Venue; status: 'created' | 'existing' }> {
    const localityRepository = manager
      ? manager.getRepository(Locality)
      : this.localityRepository;
    const venueRepository = manager
      ? manager.getRepository(Venue)
      : this.venueRepository;
    const locality = await localityRepository.findOneBy({ id: localityId });
    if (!locality)
      throw new BadRequestException(
        `Locality with id ${localityId} does not exist`,
      );

    const existing = await venueRepository.findOneBy({
      localityId,
      isGeneric: true,
    });
    if (existing) return { venue: existing, status: 'existing' };

    const inserted = (await venueRepository.query(
      `INSERT INTO "venues" ("name", "name_normalized", "type", "status", "locality_id", "is_generic")
       VALUES ($1, $2, 'other', 'active', $3, true)
       ON CONFLICT ("locality_id") WHERE "is_generic" = true DO NOTHING
       RETURNING "id"`,
      [locality.name, normalizeGeography(locality.name), locality.id],
    )) as Array<{ id: string }>;
    const venue = inserted[0]
      ? await venueRepository.findOneBy({ id: inserted[0].id })
      : await venueRepository.findOneBy({ localityId, isGeneric: true });
    if (!venue?.id)
      throw new ConflictException('Generic venue could not be persisted');
    return { venue, status: inserted[0] ? 'created' : 'existing' };
  }

  async createImportVenue(
    name: string,
    localityId: string,
    manager: EntityManager,
  ): Promise<{ venue: Venue; status: 'created' | 'existing' }> {
    const cleanName = name.trim().replace(/\s+/gu, ' ');
    const nameNormalized = normalizeGeography(cleanName);
    if (!nameNormalized || cleanName.length > 180)
      throw new BadRequestException('Venue name is invalid');
    const venueRepository = manager.getRepository(Venue);
    const existing = await venueRepository.findOneBy({
      localityId,
      nameNormalized,
      isGeneric: false,
    });
    if (existing) return { venue: existing, status: 'existing' };
    const inserted = (await venueRepository.query(
      `INSERT INTO "venues" ("name", "name_normalized", "type", "status", "locality_id", "is_generic")
       VALUES ($1, $2, 'concert_hall', 'active', $3, false)
       ON CONFLICT ("locality_id", "name_normalized") WHERE "is_generic" = false DO NOTHING
       RETURNING "id"`,
      [cleanName, nameNormalized, localityId],
    )) as Array<{ id: string }>;
    const venue = inserted[0]
      ? await venueRepository.findOneBy({ id: inserted[0].id })
      : await venueRepository.findOneBy({
          localityId,
          nameNormalized,
          isGeneric: false,
        });
    if (!venue)
      throw new ConflictException('Import venue could not be persisted');
    return { venue, status: inserted[0] ? 'created' : 'existing' };
  }

  async importBatch(dto: ImportVenuesBatchDto) {
    await this.ensureLocality(dto.localityId);
    const results: Array<{
      index: number;
      name: unknown;
      status: 'created' | 'existing' | 'duplicate_in_batch' | 'failed';
      venueId?: string;
      error?: string;
    }> = [];
    const validRows: Array<{
      index: number;
      inputName: unknown;
      row: ImportVenueRowDto;
      normalized: string;
    }> = [];

    for (const [index, value] of dto.venues.entries()) {
      const inputName = this.readInputName(value);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        results.push({
          index,
          name: inputName,
          status: 'failed',
          error: 'Each venue must be an object',
        });
        continue;
      }
      const row = plainToInstance(ImportVenueRowDto, value);
      const errors = await validate(row, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        results.push({
          index,
          name: inputName,
          status: 'failed',
          error: errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .join('; '),
        });
        continue;
      }
      validRows.push({
        index,
        inputName,
        row,
        normalized: normalizeGeography(row.name),
      });
    }

    const firstIndexByName = new Map<string, number>();
    const duplicateNames = new Map<number, string>();
    const uniqueRows = validRows.filter((item) => {
      const firstIndex = firstIndexByName.get(item.normalized);
      if (firstIndex !== undefined) {
        duplicateNames.set(item.index, item.normalized);
        results.push({
          index: item.index,
          name: item.inputName,
          status: 'duplicate_in_batch',
        });
        return false;
      }
      firstIndexByName.set(item.normalized, item.index);
      return true;
    });

    const names = [...new Set(uniqueRows.map((item) => item.normalized))];
    const existingVenues = names.length
      ? await this.venueRepository
          .createQueryBuilder('venue')
          .where('venue.isGeneric = false')
          .andWhere('venue.localityId = :localityId', {
            localityId: dto.localityId,
          })
          .andWhere('venue.nameNormalized IN (:...names)', { names })
          .getMany()
      : [];
    const byName = new Map(
      existingVenues.map((venue) => [venue.nameNormalized, venue]),
    );

    for (const item of uniqueRows) {
      const existing = byName.get(item.normalized);
      if (existing) {
        results.push({
          index: item.index,
          name: item.inputName,
          status: 'existing',
          venueId: existing.id,
        });
        continue;
      }
      try {
        const venue = await this.persistVenue({
          name: item.row.name,
          type: item.row.type ?? 'concert_hall',
          localityId: dto.localityId,
        });
        byName.set(item.normalized, venue);
        results.push({
          index: item.index,
          name: item.inputName,
          status: 'created',
          venueId: venue.id,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          const concurrent = await this.venueRepository.findOneBy({
            localityId: dto.localityId,
            nameNormalized: item.normalized,
          });
          if (concurrent) {
            byName.set(item.normalized, concurrent);
            results.push({
              index: item.index,
              name: item.inputName,
              status: 'existing',
              venueId: concurrent.id,
            });
            continue;
          }
        }
        results.push({
          index: item.index,
          name: item.inputName,
          status: 'failed',
          error: this.getErrorMessage(error),
        });
      }
    }

    for (const [index, normalized] of duplicateNames) {
      const original = results.find(
        (result) =>
          result.status !== 'duplicate_in_batch' &&
          validRows.find((row) => row.index === result.index)?.normalized ===
            normalized,
      );
      if (original?.venueId) {
        const duplicate = results.find((result) => result.index === index);
        if (duplicate) duplicate.venueId = original.venueId;
      }
    }
    results.sort((left, right) => left.index - right.index);
    const summary = {
      total: results.length,
      created: results.filter((result) => result.status === 'created').length,
      existing: results.filter((result) => result.status === 'existing').length,
      duplicates: results.filter(
        (result) => result.status === 'duplicate_in_batch',
      ).length,
      failed: results.filter((result) => result.status === 'failed').length,
    };
    return { summary, results };
  }

  private async persistVenue(
    dto: Pick<CreateVenueDto, 'name' | 'type' | 'localityId'> &
      Partial<Omit<CreateVenueDto, 'name' | 'type' | 'localityId'>>,
  ): Promise<Venue> {
    const name = dto.name.trim().replace(/\s+/gu, ' ');
    const venue = this.venueRepository.create({
      ...dto,
      name,
      nameNormalized: normalizeGeography(name),
      status: dto.status ?? 'active',
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });
    return this.venueRepository.save(venue);
  }

  private readInputName(value: unknown): unknown {
    if (typeof value === 'object' && value !== null && 'name' in value)
      return value.name;
    return null;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error
      ? 'Venue could not be imported because of a persistence error'
      : 'Venue could not be imported';
  }

  async findAll(query: VenuesQueryDto) {
    const { limit = 20, offset = 0 } = query;
    const builder = this.venueRepository
      .createQueryBuilder('venue')
      .where('venue.isGeneric = false')
      .innerJoinAndSelect('venue.locality', 'locality')
      .innerJoinAndSelect(
        'locality.administrativeRegion',
        'administrativeRegion',
      )
      .innerJoinAndSelect('administrativeRegion.country', 'country');
    this.applyFilters(builder, query);
    builder
      .orderBy('venue.nameNormalized', 'ASC')
      .addOrderBy('venue.id', 'ASC');
    const [data, totalItems] = await builder
      .take(limit)
      .skip(offset)
      .getManyAndCount();
    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      data,
    };
  }

  async findOne(id: string): Promise<Venue> {
    const venue = await this.venueRepository.findOne({
      where: { id },
      relations: {
        locality: { administrativeRegion: { country: true } },
      },
    });
    if (!venue) throw new NotFoundException(`Venue with id ${id} not found`);
    return venue;
  }

  async update(id: string, dto: UpdateVenueDto): Promise<Venue> {
    const venue = await this.venueRepository.findOneBy({ id });
    if (!venue) throw new NotFoundException(`Venue with id ${id} not found`);
    if (venue.isGeneric)
      throw new BadRequestException(
        'Generic venues are managed by their locality',
      );
    this.ensureCoordinatePair(
      dto.latitude === undefined ? venue.latitude : dto.latitude,
      dto.longitude === undefined ? venue.longitude : dto.longitude,
    );
    if (dto.localityId !== undefined) await this.ensureLocality(dto.localityId);
    Object.assign(venue, dto);
    if (dto.name !== undefined) {
      venue.name = dto.name.trim().replace(/\s+/gu, ' ');
      venue.nameNormalized = normalizeGeography(venue.name);
    }
    if (dto.latitude !== undefined) venue.latitude = dto.latitude;
    if (dto.longitude !== undefined) venue.longitude = dto.longitude;
    try {
      return await this.venueRepository.save(venue);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async remove(id: string): Promise<{ affected: number }> {
    const venue = await this.venueRepository.findOneBy({ id });
    if (venue?.isGeneric)
      throw new BadRequestException(
        'Generic venues are managed by their locality',
      );
    const result = await this.venueRepository.delete({ id });
    if (!result.affected)
      throw new NotFoundException(`Venue with id ${id} not found`);
    return { affected: result.affected };
  }

  async findMap(query: VenuesQueryDto) {
    const builder = this.venueRepository
      .createQueryBuilder('venue')
      .where('venue.isGeneric = false')
      .innerJoin('venue.locality', 'locality')
      .innerJoin('locality.administrativeRegion', 'administrativeRegion')
      .innerJoin('administrativeRegion.country', 'country')
      .select('venue.id', 'id')
      .addSelect('venue.name', 'name')
      .addSelect('venue.type', 'type')
      .addSelect('locality.name', 'locality')
      .addSelect('locality.province', 'province')
      .addSelect('administrativeRegion.name', 'region')
      .addSelect('country.name', 'country')
      .addSelect('COALESCE(venue.latitude, locality.latitude)', 'latitude')
      .addSelect('COALESCE(venue.longitude, locality.longitude)', 'longitude')
      .addSelect(
        `CASE WHEN venue.latitude IS NOT NULL THEN 'venue' WHEN locality.latitude IS NOT NULL THEN 'locality' ELSE 'unavailable' END`,
        'precision',
      );
    this.applyFilters(builder, query);
    builder
      .orderBy('venue.nameNormalized', 'ASC')
      .addOrderBy('venue.id', 'ASC');
    const rows = await builder
      .take(query.limit ?? 100)
      .skip(query.offset ?? 0)
      .getRawMany<VenueMapRow>();
    const countBuilder = this.venueRepository
      .createQueryBuilder('venue')
      .where('venue.isGeneric = false')
      .innerJoin('venue.locality', 'locality')
      .innerJoin('locality.administrativeRegion', 'administrativeRegion')
      .innerJoin('administrativeRegion.country', 'country');
    this.applyFilters(countBuilder, query);
    const totalItems = await countBuilder.getCount();
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      attribution: {
        text: '© OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
      },
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        locality: row.locality,
        province: row.province,
        region: row.region,
        country: row.country,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        precision: row.precision,
      })),
    };
  }

  async resolveBatch(dto: ResolveVenuesBatchDto) {
    if (dto.venues.length === 0) return { results: [] };
    const names = [
      ...new Set(dto.venues.map((item) => normalizeGeography(item.name))),
    ];
    const localityIds = [...new Set(dto.venues.map((item) => item.localityId))];
    const candidates = await this.venueRepository
      .createQueryBuilder('venue')
      .where('venue.isGeneric = false')
      .select([
        'venue.id',
        'venue.name',
        'venue.nameNormalized',
        'venue.localityId',
      ])
      .andWhere('venue.localityId IN (:...localityIds)', { localityIds })
      .andWhere('venue.nameNormalized IN (:...names)', { names })
      .getMany();
    return {
      results: dto.venues.map((input, index) => {
        const normalized = normalizeGeography(input.name);
        const matches = candidates.filter(
          (candidate) =>
            candidate.localityId === input.localityId &&
            candidate.nameNormalized === normalized,
        );
        return {
          index,
          name: input.name,
          localityId: input.localityId,
          venue:
            matches.length === 1
              ? { id: matches[0].id, name: matches[0].name }
              : null,
          status:
            matches.length > 1
              ? ('ambiguous' as const)
              : matches.length === 1
                ? ('existing' as const)
                : ('new' as const),
          ...(matches.length > 1 ? { code: 'VENUE_AMBIGUOUS' } : {}),
          candidates: matches.map(({ id, name }) => ({ id, name })),
        };
      }),
    };
  }

  private applyFilters(
    builder: SelectQueryBuilder<Venue>,
    query: VenuesQueryDto,
  ): void {
    if (query.query)
      builder.andWhere('venue.nameNormalized LIKE :query', {
        query: `%${normalizeGeography(query.query)}%`,
      });
    if (query.localityId)
      builder.andWhere('locality.id = :localityId', {
        localityId: query.localityId,
      });
    if (query.province)
      builder.andWhere('locality.provinceNormalized = :province', {
        province: normalizeGeography(query.province),
      });
    if (query.administrativeRegionId)
      builder.andWhere('administrativeRegion.id = :administrativeRegionId', {
        administrativeRegionId: query.administrativeRegionId,
      });
    if (query.countryId)
      builder.andWhere('country.id = :countryId', {
        countryId: query.countryId,
      });
    if (query.type)
      builder.andWhere('venue.type = :type', { type: query.type });
    if (query.status)
      builder.andWhere('venue.status = :status', { status: query.status });
  }

  private async ensureLocality(id: string): Promise<void> {
    if (!(await this.localityRepository.existsBy({ id }))) {
      throw new BadRequestException(`Locality with id ${id} does not exist`);
    }
  }

  private ensureCoordinatePair(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): void {
    if (
      (latitude === null || latitude === undefined) !==
      (longitude === null || longitude === undefined)
    ) {
      throw new BadRequestException(
        'Latitude and longitude must be supplied together',
      );
    }
  }

  private handleWriteError(error: unknown): never {
    if (isDuplicateKeyError(error)) {
      throw new ConflictException(
        'A venue with this normalized name already exists in this locality',
      );
    }
    throw error;
  }
}
