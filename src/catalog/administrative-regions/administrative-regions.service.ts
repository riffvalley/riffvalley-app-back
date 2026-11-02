import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../countries/entities/country.entity';
import { normalizeGeography } from '../geography/helpers/normalize-geography';
import { CreateAdministrativeRegionDto } from './dto/create-administrative-region.dto';
import { AdministrativeRegionsQueryDto } from './dto/administrative-regions-query.dto';
import { UpdateAdministrativeRegionDto } from './dto/update-administrative-region.dto';
import { AdministrativeRegion } from './entities/administrative-region.entity';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

@Injectable()
export class AdministrativeRegionsService {
  constructor(
    @InjectRepository(AdministrativeRegion)
    private readonly regionRepository: Repository<AdministrativeRegion>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  async create(
    dto: CreateAdministrativeRegionDto,
  ): Promise<AdministrativeRegion> {
    if (!(await this.countryRepository.existsBy({ id: dto.countryId }))) {
      throw new BadRequestException(
        `Country with id ${dto.countryId} does not exist`,
      );
    }
    const name = dto.name.trim().replace(/\s+/gu, ' ');
    const region = this.regionRepository.create({
      name,
      nameNormalized: normalizeGeography(name),
      countryId: dto.countryId,
      code: dto.code?.trim().toUpperCase() || null,
    });
    try {
      return await this.regionRepository.save(region);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async findAll(query: AdministrativeRegionsQueryDto) {
    const { limit = 100, offset = 0 } = query;
    const builder = this.regionRepository
      .createQueryBuilder('region')
      .innerJoinAndSelect('region.country', 'country');
    if (query.countryId) {
      builder.andWhere('region.countryId = :countryId', {
        countryId: query.countryId,
      });
    }
    if (query.query) {
      builder.andWhere('region.nameNormalized LIKE :query', {
        query: `%${normalizeGeography(query.query)}%`,
      });
    }
    builder
      .orderBy('region.nameNormalized', 'ASC')
      .addOrderBy('region.id', 'ASC');
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

  async findOne(id: string): Promise<AdministrativeRegion> {
    const region = await this.regionRepository.findOne({
      where: { id },
      relations: { country: true },
    });
    if (!region)
      throw new NotFoundException(
        `Administrative region with id ${id} not found`,
      );
    return region;
  }

  async update(
    id: string,
    dto: UpdateAdministrativeRegionDto,
  ): Promise<AdministrativeRegion> {
    const region = await this.regionRepository.findOneBy({ id });
    if (!region)
      throw new NotFoundException(
        `Administrative region with id ${id} not found`,
      );
    if (dto.countryId !== undefined && dto.countryId !== region.countryId) {
      throw new BadRequestException(
        'Changing the country of an administrative region is not supported',
      );
    }
    if (dto.name !== undefined) {
      region.name = dto.name.trim().replace(/\s+/gu, ' ');
      region.nameNormalized = normalizeGeography(region.name);
    }
    if (dto.code !== undefined)
      region.code = dto.code?.trim().toUpperCase() || null;
    try {
      return await this.regionRepository.save(region);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async findByIdentity(
    countryId: string,
    nameNormalized: string,
  ): Promise<AdministrativeRegion | null> {
    return this.regionRepository.findOne({
      where: { countryId, nameNormalized },
      relations: { country: true },
    });
  }

  private handleWriteError(error: unknown): never {
    if (isDuplicateKeyError(error)) {
      throw new ConflictException(
        'An equivalent administrative region or country code already exists',
      );
    }
    throw error;
  }
}
