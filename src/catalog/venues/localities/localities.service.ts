import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdministrativeRegionsService } from '../../administrative-regions/administrative-regions.service';
import { AdministrativeRegion } from '../../administrative-regions/entities/administrative-region.entity';
import { Country } from '../../countries/entities/country.entity';
import { normalizeGeography } from '../../geography/helpers/normalize-geography';
import { ManageLocalityAliasDto } from '../dto/manage-locality-alias.dto';
import { LocalityAlias } from '../entities/locality-alias.entity';
import { Locality } from '../entities/locality.entity';
import { ResolveLocalityDto } from '../dto/resolve-locality.dto';
import { InspectLocalitiesBatchDto } from '../dto/inspect-localities-batch.dto';
import {
  GeocodingAlias,
  NominatimGeocoderService,
} from './nominatim-geocoder.service';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

class AmbiguousLocalityMatchError extends Error {}

@Injectable()
export class LocalitiesService {
  constructor(
    @InjectRepository(Locality)
    private readonly localityRepository: Repository<Locality>,
    @InjectRepository(LocalityAlias)
    private readonly aliasRepository: Repository<LocalityAlias>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(AdministrativeRegion)
    private readonly regionRepository: Repository<AdministrativeRegion>,
    private readonly administrativeRegionsService: AdministrativeRegionsService,
    private readonly geocoder: NominatimGeocoderService,
  ) {}

  async inspectBatch(dto: InspectLocalitiesBatchDto) {
    const { localities } = dto;
    if (localities.length === 0) return { results: [] };
    const countryIds = [...new Set(localities.map((item) => item.countryId))];
    const regionIds = [
      ...new Set(
        localities.flatMap((item) =>
          item.administrativeRegionId ? [item.administrativeRegionId] : [],
        ),
      ),
    ];
    const [countries, regions] = await Promise.all([
      this.countryRepository.find({
        where: { id: In(countryIds) },
        select: { id: true, name: true },
      }),
      regionIds.length
        ? this.regionRepository.find({
            where: { id: In(regionIds) },
            relations: { country: true },
          })
        : Promise.resolve([]),
    ]);
    const countryById = new Map(
      countries.map((country) => [country.id, country]),
    );
    const regionById = new Map(regions.map((region) => [region.id, region]));
    const inputKeys = [
      ...new Set(localities.map((item) => normalizeGeography(item.name))),
    ].filter(Boolean);
    const candidates = inputKeys.length
      ? await this.localityRepository
          .createQueryBuilder('locality')
          .innerJoinAndSelect('locality.administrativeRegion', 'region')
          .innerJoinAndSelect('region.country', 'country')
          .leftJoinAndSelect(
            'locality.aliases',
            'alias',
            'alias.normalizedName IN (:...inputKeys)',
            { inputKeys },
          )
          .where(
            '(locality.nameNormalized IN (:...inputKeys) OR EXISTS (SELECT 1 FROM locality_aliases alias WHERE alias.locality_id = locality.id AND alias.normalized_name IN (:...inputKeys)))',
            { inputKeys },
          )
          .andWhere('region.countryId IN (:...countryIds)', { countryIds })
          .getMany()
      : [];
    const candidatesByName = new Map<string, Map<string, Locality>>();
    for (const candidate of candidates) {
      const names = new Set([
        candidate.nameNormalized,
        ...(candidate.aliases ?? []).map((alias) => alias.normalizedName),
      ]);
      for (const name of names) {
        const matchingCandidates = candidatesByName.get(name) ?? new Map();
        matchingCandidates.set(candidate.id, candidate);
        candidatesByName.set(name, matchingCandidates);
      }
    }

    return {
      results: localities.map((input, index) => {
        const base = { index, input };
        const country = countryById.get(input.countryId);
        if (!country)
          return {
            ...base,
            status: 'invalid' as const,
            code: 'LOCALITY_COUNTRY_NOT_FOUND',
            candidates: [],
          };
        const region = input.administrativeRegionId
          ? regionById.get(input.administrativeRegionId)
          : undefined;
        if (input.administrativeRegionId && !region)
          return {
            ...base,
            status: 'invalid' as const,
            code: 'LOCALITY_REGION_NOT_FOUND',
            candidates: [],
          };
        if (region && region.countryId !== input.countryId)
          return {
            ...base,
            status: 'invalid' as const,
            code: 'LOCALITY_REGION_COUNTRY_MISMATCH',
            candidates: [],
          };

        const nameKey = normalizeGeography(input.name);
        const provinceKey = input.province
          ? normalizeGeography(input.province)
          : null;
        const matches = [
          ...(candidatesByName.get(nameKey)?.values() ?? []),
        ].filter((candidate) => {
          return (
            candidate.administrativeRegion.countryId === input.countryId &&
            (!input.administrativeRegionId ||
              candidate.administrativeRegionId ===
                input.administrativeRegionId) &&
            (!provinceKey ||
              candidate.provinceNormalized === provinceKey ||
              candidate.provinceNormalized === '')
          );
        });
        const uniqueMatches = matches;
        const toCandidate = (locality: Locality) => ({
          id: locality.id,
          name: locality.name,
          province: locality.province,
          country: {
            id: locality.administrativeRegion.countryId,
            name: locality.administrativeRegion.country.name,
          },
          administrativeRegion: {
            id: locality.administrativeRegion.id,
            name: locality.administrativeRegion.name,
          },
        });
        if (uniqueMatches.length > 1)
          return {
            ...base,
            status: 'ambiguous' as const,
            code: 'LOCALITY_AMBIGUOUS',
            candidates: uniqueMatches.map(toCandidate),
          };
        if (uniqueMatches[0])
          return {
            ...base,
            status: 'existing' as const,
            locality: toCandidate(uniqueMatches[0]),
            candidates: [],
          };
        return {
          ...base,
          status: 'new' as const,
          candidates: [],
          requiresAdministrativeRegionId: !region,
        };
      }),
    };
  }

  async resolveAndGeocode(dto: ResolveLocalityDto) {
    const name = dto.name.trim().replace(/\s+/gu, ' ');
    const province = dto.province?.trim().replace(/\s+/gu, ' ') || null;
    const nameNormalized = normalizeGeography(name);
    const provinceNormalized = province ? normalizeGeography(province) : '';
    const region = await this.resolveAdministrativeRegion(dto);

    let locality: Locality | null;
    try {
      locality = await this.findLocalMatch(
        region.id,
        nameNormalized,
        provinceNormalized,
        province !== null,
      );
    } catch (error) {
      if (error instanceof AmbiguousLocalityMatchError)
        return this.ambiguousResult();
      throw error;
    }
    if (!locality) {
      const aliasMatches = await this.findAliasMatches(
        region.id,
        nameNormalized,
        provinceNormalized,
        province !== null,
      );
      if (aliasMatches.length > 1) return this.ambiguousResult();
      locality = aliasMatches[0] ?? null;
    }

    if (locality && province && locality.provinceNormalized === '') {
      locality.province = province;
      locality.provinceNormalized = provinceNormalized;
      locality = await this.localityRepository.save(locality);
    }

    let isNew = locality === null;
    if (!locality) {
      locality = this.localityRepository.create({
        name,
        nameNormalized,
        province,
        provinceNormalized,
        administrativeRegionId: region.id,
      });
      try {
        locality = await this.localityRepository.save(locality);
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const raced = await this.findLocalMatch(
          region.id,
          nameNormalized,
          provinceNormalized,
          province !== null,
        );
        if (!raced) throw error;
        locality = raced;
        isNew = false;
      }
    }
    this.attachRegion(locality, region);

    if (locality.latitude != null && locality.longitude != null) {
      return {
        locality,
        geocoding: { status: 'cached' as const },
        attribution: this.attribution(),
      };
    }

    const result = await this.geocoder.geocode(locality);
    if (result.status === 'cached') {
      locality.latitude = result.latitude;
      locality.longitude = result.longitude;
      locality.osmType = result.osmType;
      locality.osmId = result.osmId;
      return {
        locality,
        geocoding: { status: 'cached' as const },
        attribution: this.attribution(),
      };
    }
    if (result.status !== 'geocoded') return { locality, geocoding: result };

    locality.latitude = result.latitude;
    locality.longitude = result.longitude;
    locality.osmType = result.osmType;
    locality.osmId = result.osmId;
    try {
      const identityMatch = await this.localityRepository.findOne({
        where: { osmType: result.osmType, osmId: result.osmId },
        relations: { administrativeRegion: { country: true }, aliases: true },
      });
      if (identityMatch && identityMatch.id !== locality.id) {
        if (!isNew) {
          throw new BadRequestException(
            'This locality already has a different OpenStreetMap identity owner and requires manual review',
          );
        }
        if (identityMatch.administrativeRegionId !== region.id) {
          throw new BadRequestException(
            'This OpenStreetMap identity conflicts with a locality in another region',
          );
        }
        if (
          provinceNormalized &&
          identityMatch.provinceNormalized &&
          identityMatch.provinceNormalized !== provinceNormalized
        ) {
          throw new BadRequestException(
            'This OpenStreetMap identity conflicts with the supplied province',
          );
        }
        if (isNew) await this.localityRepository.delete(locality.id);
        locality = identityMatch;
        locality.latitude ??= result.latitude;
        locality.longitude ??= result.longitude;
        this.attachRegion(locality, region);
        locality = await this.localityRepository.save(locality);
      } else {
        locality = await this.localityRepository.save(locality);
      }
      await this.storeAliases(locality, result.aliases);
      if (nameNormalized !== locality.nameNormalized) {
        await this.storeAliases(locality, [
          {
            name,
            normalizedName: nameNormalized,
            language: null,
            kind: 'alternate',
          },
        ]);
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const identityMatch = await this.localityRepository.findOne({
          where: { osmType: result.osmType, osmId: result.osmId },
          relations: { administrativeRegion: { country: true }, aliases: true },
        });
        if (identityMatch) {
          if (isNew && identityMatch.id !== locality.id)
            await this.localityRepository.delete(locality.id);
          locality = identityMatch;
          this.attachRegion(locality, region);
          await this.storeAliases(locality, result.aliases);
          if (nameNormalized !== locality.nameNormalized) {
            await this.storeAliases(locality, [
              {
                name,
                normalizedName: nameNormalized,
                language: null,
                kind: 'alternate',
              },
            ]);
          }
        } else {
          throw new BadRequestException(
            'This OpenStreetMap reference conflicts with another locality identity',
          );
        }
      } else {
        throw error;
      }
    }
    return {
      locality,
      geocoding: { status: 'geocoded' as const },
      attribution: this.attribution(),
    };
  }

  async addAlias(localityId: string, dto: ManageLocalityAliasDto) {
    const locality = await this.localityRepository.findOne({
      where: { id: localityId },
      relations: { aliases: true },
    });
    if (!locality) throw new NotFoundException('Locality not found');
    const name = dto.name.trim().replace(/\s+/gu, ' ');
    const normalizedName = normalizeGeography(name);
    if (normalizedName === locality.nameNormalized)
      throw new BadRequestException(
        'An alias cannot repeat the canonical name',
      );

    const existingAliases = await this.aliasRepository.find({
      where: { normalizedName },
      relations: { locality: true },
    });
    if (
      existingAliases.some(
        (alias) =>
          alias.localityId !== locality.id &&
          alias.locality?.administrativeRegionId ===
            locality.administrativeRegionId &&
          (!alias.locality.provinceNormalized ||
            !locality.provinceNormalized ||
            alias.locality.provinceNormalized === locality.provinceNormalized),
      )
    ) {
      throw new BadRequestException(
        'Alias would create an ambiguous locality match',
      );
    }
    const existing = existingAliases.find(
      (alias) => alias.localityId === locality.id,
    );
    if (existing) return { locality, alias: existing };
    const alias = this.aliasRepository.create({
      localityId,
      name,
      normalizedName,
      language: dto.language?.toLowerCase() ?? null,
      kind: dto.kind ?? 'alternate',
    });
    try {
      await this.aliasRepository.save(alias);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await this.aliasRepository.findOne({
        where: { localityId, normalizedName },
      });
      if (!raced) throw error;
      return { locality, alias: raced };
    }
    return { locality, alias };
  }

  async removeAlias(localityId: string, aliasId: string) {
    const alias = await this.aliasRepository.findOne({
      where: { id: aliasId, localityId },
    });
    if (!alias) throw new NotFoundException('Locality alias not found');
    await this.aliasRepository.remove(alias);
    return { id: alias.id, localityId, removed: true };
  }

  private async findLocalMatch(
    regionId: string,
    normalizedName: string,
    provinceNormalized: string,
    hasProvince: boolean,
  ): Promise<Locality | null> {
    const candidates = await this.localityRepository.find({
      where: {
        administrativeRegionId: regionId,
        nameNormalized: normalizedName,
      },
      relations: { administrativeRegion: { country: true }, aliases: true },
    });
    const matches = candidates.filter((candidate) =>
      hasProvince ? candidate.provinceNormalized === provinceNormalized : true,
    );
    if (matches.length > 1) throw new AmbiguousLocalityMatchError();
    if (matches.length === 0 && hasProvince) {
      const unqualified = candidates.filter(
        (candidate) => candidate.provinceNormalized === '',
      );
      if (unqualified.length === 1) return unqualified[0];
    }
    return matches[0] ?? null;
  }

  private async findAliasMatches(
    regionId: string,
    normalizedName: string,
    provinceNormalized: string,
    hasProvince: boolean,
  ): Promise<Locality[]> {
    const aliases = await this.aliasRepository.find({
      where: { normalizedName },
      relations: {
        locality: { administrativeRegion: { country: true }, aliases: true },
      },
    });
    const compatible = aliases
      .map((alias) => alias.locality)
      .filter(
        (locality): locality is Locality =>
          locality?.administrativeRegionId === regionId &&
          (!hasProvince ||
            locality.provinceNormalized === provinceNormalized ||
            locality.provinceNormalized === ''),
      );
    const unique = [
      ...new Map(compatible.map((item) => [item.id, item])).values(),
    ];
    if (hasProvince) {
      const exactProvince = unique.filter(
        (locality) => locality.provinceNormalized === provinceNormalized,
      );
      if (exactProvince.length) return exactProvince;
      return unique.filter((locality) => locality.provinceNormalized === '');
    }
    return unique;
  }

  private async storeAliases(locality: Locality, aliases: GeocodingAlias[]) {
    const existingNames = new Set(
      (locality.aliases ?? []).map((alias) => alias.normalizedName),
    );
    for (const alias of aliases) {
      if (
        alias.normalizedName === locality.nameNormalized ||
        existingNames.has(alias.normalizedName)
      )
        continue;
      const entity = this.aliasRepository.create({
        localityId: locality.id,
        ...alias,
      });
      try {
        const saved = await this.aliasRepository.save(entity);
        locality.aliases = [...(locality.aliases ?? []), saved];
        existingNames.add(alias.normalizedName);
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        existingNames.add(alias.normalizedName);
      }
    }
  }

  private attachRegion(locality: Locality, region: AdministrativeRegion) {
    if (!locality.administrativeRegion) locality.administrativeRegion = region;
    if (!locality.administrativeRegion.country)
      locality.administrativeRegion.country = region.country;
  }

  private ambiguousResult() {
    return { locality: null, geocoding: { status: 'ambiguous' as const } };
  }

  private attribution() {
    return {
      text: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
    };
  }

  private async resolveAdministrativeRegion(dto: ResolveLocalityDto) {
    let region: AdministrativeRegion;
    if (dto.administrativeRegionId) {
      region = await this.administrativeRegionsService.findOne(
        dto.administrativeRegionId,
      );
      if (dto.countryId && dto.countryId !== region.countryId) {
        throw new BadRequestException(
          'Country does not match the selected administrative region',
        );
      }
      if (
        dto.administrativeRegion &&
        normalizeGeography(dto.administrativeRegion) !== region.nameNormalized
      ) {
        throw new BadRequestException(
          'Administrative region name does not match its ID',
        );
      }
      return region;
    }

    if (!dto.administrativeRegion || !dto.countryId) {
      throw new BadRequestException(
        'Provide administrativeRegionId, or administrativeRegion with countryId',
      );
    }
    region = await this.administrativeRegionsService.findByIdentity(
      dto.countryId,
      normalizeGeography(dto.administrativeRegion),
    );
    if (!region) {
      throw new NotFoundException(
        'Administrative region not found for the supplied country',
      );
    }
    return region;
  }
}
