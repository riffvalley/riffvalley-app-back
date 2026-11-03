import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Artist } from '../../artists/entities/artist.entity';
import { normalizeForSearch } from '../../artists/helpers/normalize-for-search';
import {
  compareNormalizedMusicNames,
  normalizeMusicName,
  getMusicNameVariants,
} from '../../shared/music-name/normalize-music-name';
import { AdministrativeRegion } from '../../administrative-regions/entities/administrative-region.entity';
import { normalizeGeography } from '../../geography/helpers/normalize-geography';
import { Locality } from '../../venues/entities/locality.entity';
import { LocalityAlias } from '../../venues/entities/locality-alias.entity';
import { Venue } from '../../venues/entities/venue.entity';
import { VenuesService } from '../../venues/venues.service';
import { Tour } from '../../tours/entities/tour.entity';
import {
  NominatimGeocoderService,
  GeocodingResult,
} from '../../venues/localities/nominatim-geocoder.service';

export type ImportResolutionStatus =
  | 'existing'
  | 'created'
  | 'ambiguous'
  | 'invalid'
  | 'conflict';

export interface ImportResolution<T> {
  status: ImportResolutionStatus;
  code?: string;
  entity?: T;
  candidates?: Array<{ id: string; name: string }>;
}

export interface ImportLocalityInput {
  city: string;
  localityId?: string;
  venueId?: string;
  venueName?: string | null;
  province?: string | null;
  countryId?: string;
  administrativeRegionId?: string;
}

export interface PreparedImportLocality {
  input: ImportLocalityInput;
  resolution: ImportResolution<Locality>;
  geocoding?: GeocodingResult;
}

export interface ImportLocationResolution extends ImportResolution<Locality> {
  selectedVenue?: Venue;
}

export interface ImportTourResolutionContext {
  createdTours: Map<string, Tour>;
}

function localityInputKey(input: ImportLocalityInput): string {
  return [
    normalizeGeography(input.city),
    normalizeGeography(input.province ?? ''),
    input.countryId ?? '',
    input.administrativeRegionId ?? '',
    input.localityId ?? '',
    input.venueId ?? '',
    normalizeGeography(input.venueName ?? ''),
  ].join(':');
}

/** Internal, transaction-aware entity resolution primitives for future import flows. */
@Injectable()
export class ImportEntityResolversService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly geocoder: NominatimGeocoderService,
    private readonly venuesService: VenuesService,
  ) {}

  async inspectArtists(
    names: string[],
    selectedArtistIds: Array<string | null | undefined> = [],
    manager?: EntityManager,
  ): Promise<Array<ImportResolution<Pick<Artist, 'id' | 'name'>>>> {
    const repo =
      manager?.getRepository(Artist) ?? this.dataSource.getRepository(Artist);
    const keys = [
      ...new Set(names.flatMap(getMusicNameVariants).filter(Boolean)),
    ];
    const legacyKeys = [
      ...new Set(
        keys
          .map((key) => normalizeForSearch(key.normalize('NFKC')))
          .filter(Boolean),
      ),
    ];
    const explicitIds = [
      ...new Set(selectedArtistIds.filter((id): id is string => Boolean(id))),
    ];
    const candidates =
      keys.length || explicitIds.length
        ? await repo
            .createQueryBuilder('artist')
            .select(['artist.id', 'artist.name'])
            .where(
              `((artist.search_name_normalized IN (:...keys) OR (artist.search_name_normalized IS NULL AND artist.nameNormalized IN (:...legacyKeys)))${explicitIds.length ? ' OR artist.id IN (:...explicitIds)' : ''})`,
              {
                keys,
                legacyKeys,
                ...(explicitIds.length ? { explicitIds } : {}),
              },
            )
            .getMany()
        : [];
    return names.map((name, index) => {
      if (!normalizeMusicName(name))
        return { status: 'invalid', code: 'ARTIST_NAME_INVALID' };
      const selectedId = selectedArtistIds[index];
      if (selectedId) {
        const selected = candidates.find(
          (candidate) => candidate.id === selectedId,
        );
        return selected && compareNormalizedMusicNames(name, selected.name)
          ? {
              status: 'existing' as const,
              entity: { id: selected.id, name: selected.name },
            }
          : { status: 'invalid' as const, code: 'ARTIST_ID_NAME_MISMATCH' };
      }
      const matches = candidates.filter((candidate) =>
        compareNormalizedMusicNames(name, candidate.name),
      );
      if (matches.length > 1)
        return {
          status: 'ambiguous',
          code: 'ARTIST_AMBIGUOUS',
          candidates: matches.map(({ id, name: canonical }) => ({
            id,
            name: canonical,
          })),
        };
      return matches[0]
        ? {
            status: 'existing',
            entity: { id: matches[0].id, name: matches[0].name },
          }
        : { status: 'created' };
    });
  }

  async materializeArtist(
    name: string,
    manager: EntityManager,
  ): Promise<ImportResolution<Pick<Artist, 'id' | 'name'>>> {
    const key = normalizeMusicName(name);
    const displayName = name.trim().replace(/\s+/gu, ' ');
    if (!key || displayName.length > 100)
      return { status: 'invalid', code: 'ARTIST_NAME_INVALID' };
    // Serialize the non-unique catalog identity without adding a risky historical unique index.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 731904))',
      [key],
    );
    const repo = manager.getRepository(Artist);
    const keys = getMusicNameVariants(displayName);
    const legacyKeys = keys.map((variant) =>
      normalizeForSearch(variant.normalize('NFKC')),
    );
    const candidates = await repo
      .createQueryBuilder('artist')
      .select(['artist.id', 'artist.name'])
      .where(
        '(artist.search_name_normalized IN (:...keys) OR (artist.search_name_normalized IS NULL AND artist.nameNormalized IN (:...legacyKeys)))',
        {
          keys,
          legacyKeys,
        },
      )
      .getMany();
    const matches = candidates.filter((candidate) =>
      compareNormalizedMusicNames(displayName, candidate.name),
    );
    if (matches.length > 1)
      return {
        status: 'ambiguous',
        code: 'ARTIST_AMBIGUOUS',
        candidates: matches.map(({ id, name: canonical }) => ({
          id,
          name: canonical,
        })),
      };
    if (matches[0])
      return {
        status: 'existing',
        entity: { id: matches[0].id, name: matches[0].name },
      };
    const artist = await repo.save(
      repo.create({
        name: displayName,
        nameNormalized: normalizeForSearch(displayName),
        searchNameNormalized: key,
        needsReview: true,
      }),
    );
    return { status: 'created', entity: { id: artist.id, name: artist.name } };
  }

  async inspectLocality(
    input: ImportLocalityInput,
    manager?: EntityManager,
  ): Promise<ImportResolution<Locality>> {
    const city = input.city.trim().replace(/\s+/gu, ' ');
    if (!city) return { status: 'invalid', code: 'LOCALITY_NAME_INVALID' };
    const explicit = await this.inspectExplicitLocality(input, manager);
    if (explicit) return explicit;
    const nameKey = normalizeGeography(city);
    const provinceKey = input.province
      ? normalizeGeography(input.province)
      : null;
    const repo =
      manager?.getRepository(Locality) ??
      this.dataSource.getRepository(Locality);
    const rows = await repo
      .createQueryBuilder('locality')
      .leftJoinAndSelect('locality.administrativeRegion', 'region')
      .leftJoinAndSelect('region.country', 'country')
      .where(
        '(locality.nameNormalized = :nameKey OR EXISTS (SELECT 1 FROM locality_aliases alias WHERE alias.locality_id = locality.id AND alias.normalized_name = :nameKey))',
        { nameKey },
      )
      .andWhere(
        input.administrativeRegionId
          ? 'locality.administrativeRegionId = :regionId'
          : '1 = 1',
        { regionId: input.administrativeRegionId },
      )
      .andWhere(input.countryId ? 'region.countryId = :countryId' : '1 = 1', {
        countryId: input.countryId,
      })
      .andWhere(
        provinceKey
          ? '(locality.provinceNormalized = :provinceKey OR locality.provinceNormalized = :empty)'
          : '1 = 1',
        { provinceKey, empty: '' },
      )
      .getMany();
    const distinct = [...new Map(rows.map((row) => [row.id, row])).values()];
    if (distinct.length > 1)
      return {
        status: 'ambiguous',
        code: 'LOCALITY_AMBIGUOUS',
        candidates: distinct.map((item) => ({
          id: item.id,
          name: `${item.name}${item.province ? `, ${item.province}` : ''} — ${item.administrativeRegion?.name ?? ''}, ${item.administrativeRegion?.country?.name ?? ''}`,
        })),
      };
    if (distinct[0]) return { status: 'existing', entity: distinct[0] };
    if (!input.administrativeRegionId)
      return { status: 'invalid', code: 'LOCALITY_CONTEXT_REQUIRED' };
    const region = await (
      manager?.getRepository(AdministrativeRegion) ??
      this.dataSource.getRepository(AdministrativeRegion)
    ).findOne({
      where: { id: input.administrativeRegionId },
      relations: { country: true },
    });
    if (!region || (input.countryId && region.countryId !== input.countryId))
      return { status: 'invalid', code: 'LOCALITY_REGION_COUNTRY_MISMATCH' };
    return { status: 'created' };
  }

  async prepareLocalities(
    inputs: ImportLocalityInput[],
  ): Promise<PreparedImportLocality[]> {
    const preparedByKey = new Map<string, PreparedImportLocality>();
    const results: PreparedImportLocality[] = [];
    for (const input of inputs) {
      const key = localityInputKey(input);
      const cached = preparedByKey.get(key);
      if (cached) {
        results.push(cached);
        continue;
      }
      const resolution = await this.inspectLocality(input);
      if (resolution.status !== 'created') {
        const result = { input, resolution };
        preparedByKey.set(key, result);
        results.push(result);
        continue;
      }
      const region = await this.dataSource
        .getRepository(AdministrativeRegion)
        .findOne({
          where: { id: input.administrativeRegionId },
          relations: { country: true },
        });
      if (!region) {
        const result: PreparedImportLocality = {
          input,
          resolution: { status: 'invalid', code: 'LOCALITY_CONTEXT_REQUIRED' },
        };
        preparedByKey.set(key, result);
        results.push(result);
        continue;
      }
      const city = input.city.trim().replace(/\s+/gu, ' ');
      const locality = Object.assign(new Locality(), {
        id: randomUUID(),
        name: city,
        nameNormalized: normalizeGeography(city),
        province: input.province?.trim().replace(/\s+/gu, ' ') || null,
        provinceNormalized: normalizeGeography(input.province ?? ''),
        administrativeRegionId: region.id,
        administrativeRegion: region,
      });
      const geocoding = await this.geocoder.geocode(locality);
      const result: PreparedImportLocality = {
        input,
        resolution:
          geocoding.status === 'geocoded' || geocoding.status === 'cached'
            ? { status: 'created', code: 'LOCALITY_PREPARED' }
            : {
                status:
                  geocoding.status === 'ambiguous' ? 'ambiguous' : 'invalid',
                code:
                  geocoding.status === 'ambiguous'
                    ? 'LOCALITY_AMBIGUOUS'
                    : 'LOCALITY_GEOCODING_UNAVAILABLE',
              },
        geocoding,
      };
      preparedByKey.set(key, result);
      results.push(result);
    }
    return results;
  }

  async materializeLocality(
    input: ImportLocalityInput,
    manager: EntityManager,
    prepared?: PreparedImportLocality,
  ): Promise<ImportLocationResolution> {
    const explicit = await this.inspectExplicitLocality(input, manager);
    if (explicit) return explicit;
    const inspected = await this.inspectLocalityWithManager(input, manager);
    if (inspected.status !== 'created') return inspected;
    if (
      !prepared ||
      localityInputKey(prepared.input) !== localityInputKey(input) ||
      prepared.resolution.status !== 'created' ||
      (prepared.geocoding?.status !== 'geocoded' &&
        prepared.geocoding?.status !== 'cached')
    ) {
      return { status: 'conflict', code: 'LOCALITY_PREPARATION_REQUIRED' };
    }
    const city = input.city.trim().replace(/\s+/gu, ' ');
    const province = input.province?.trim().replace(/\s+/gu, ' ') || null;
    const localityRepo = manager.getRepository(Locality);
    const nameNormalized = normalizeGeography(city);
    const provinceNormalized = province ? normalizeGeography(province) : '';
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 731905))',
      [
        `${input.administrativeRegionId}:${provinceNormalized}:${nameNormalized}`,
      ],
    );
    const current = await this.findLocalityMatch(
      manager,
      nameNormalized,
      provinceNormalized,
      input.administrativeRegionId as string,
    );
    if (current) return { status: 'existing', entity: current };
    const inserted = (await manager.query(
      `INSERT INTO "localities"
        ("name", "name_normalized", "province", "province_normalized", "administrative_region_id", "latitude", "longitude", "osm_type", "osm_id")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING "id"`,
      [
        city,
        nameNormalized,
        province,
        provinceNormalized,
        input.administrativeRegionId,
        prepared.geocoding.latitude,
        prepared.geocoding.longitude,
        prepared.geocoding.osmType,
        prepared.geocoding.osmId,
      ],
    )) as Array<{ id: string }>;
    const locality = inserted[0]
      ? await localityRepo.findOneBy({ id: inserted[0].id })
      : null;
    if (!locality) {
      const identityMatch =
        prepared.geocoding.osmType && prepared.geocoding.osmId
          ? await localityRepo.findOneBy({
              osmType: prepared.geocoding.osmType,
              osmId: prepared.geocoding.osmId,
            })
          : null;
      if (identityMatch)
        return {
          status: 'conflict',
          code: 'LOCALITY_OSM_IDENTITY_CONFLICT',
          entity: identityMatch,
        };
      const raced = await this.findLocalityMatch(
        manager,
        nameNormalized,
        provinceNormalized,
        input.administrativeRegionId as string,
      );
      return raced
        ? { status: 'existing', entity: raced }
        : { status: 'conflict', code: 'LOCALITY_UNIQUENESS_CONFLICT' };
    }
    if (prepared.geocoding.status === 'geocoded') {
      const aliasRepo = manager.getRepository(LocalityAlias);
      for (const alias of prepared.geocoding.aliases) {
        await aliasRepo.save(
          aliasRepo.create({ localityId: locality.id, ...alias }),
        );
      }
    }
    return { status: 'created', entity: locality };
  }

  async inspectVenue(
    name: string | null | undefined,
    localityId: string,
  ): Promise<ImportResolution<Venue>> {
    if (!name?.trim()) return { status: 'created', code: 'VENUE_GENERIC' };
    const key = normalizeGeography(name);
    if (!key) return { status: 'invalid', code: 'VENUE_NAME_INVALID' };
    const venue = await this.dataSource
      .getRepository(Venue)
      .findOneBy({ localityId, nameNormalized: key, isGeneric: false });
    return venue
      ? { status: 'existing', entity: venue }
      : { status: 'created' };
  }

  async materializeVenue(
    name: string | null | undefined,
    localityId: string,
    manager: EntityManager,
    venueId?: string,
    selectedVenue?: Venue,
  ): Promise<ImportResolution<Venue>> {
    if (venueId) {
      const selected =
        selectedVenue?.id === venueId
          ? selectedVenue
          : await manager.getRepository(Venue).findOneBy({ id: venueId });
      if (!selected) return { status: 'invalid', code: 'VENUE_ID_NOT_FOUND' };
      if (selected.localityId !== localityId)
        return { status: 'invalid', code: 'VENUE_LOCALITY_MISMATCH' };
      if (name?.trim() && normalizeGeography(name) !== selected.nameNormalized)
        return { status: 'invalid', code: 'VENUE_ID_NAME_MISMATCH' };
      return { status: 'existing', entity: selected };
    }
    if (!name?.trim()) {
      const result = await this.venuesService.getOrCreateGenericVenueWithStatus(
        localityId,
        manager,
      );
      return {
        status: result.status,
        entity: result.venue,
        code: 'VENUE_GENERIC',
      };
    }
    const cleanName = name.trim().replace(/\s+/gu, ' ');
    const key = normalizeGeography(cleanName);
    if (!key || cleanName.length > 180)
      return { status: 'invalid', code: 'VENUE_NAME_INVALID' };
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 731906))',
      [`${localityId}:${key}`],
    );
    const result = await this.venuesService.createImportVenue(
      cleanName,
      localityId,
      manager,
    );
    return { status: result.status, entity: result.venue };
  }

  private async inspectExplicitLocality(
    input: ImportLocalityInput,
    manager?: EntityManager,
  ): Promise<ImportLocationResolution | null> {
    if (!input.localityId && !input.venueId) return null;

    let selectedVenue: Venue | null = null;
    if (input.venueId) {
      selectedVenue = await (
        manager?.getRepository(Venue) ?? this.dataSource.getRepository(Venue)
      ).findOne({
        where: { id: input.venueId },
        relations: {
          locality: { administrativeRegion: { country: true }, aliases: true },
        },
      });
      if (!selectedVenue)
        return { status: 'invalid', code: 'VENUE_ID_NOT_FOUND' };
      if (
        input.venueName?.trim() &&
        normalizeGeography(input.venueName) !== selectedVenue.nameNormalized
      )
        return { status: 'invalid', code: 'VENUE_ID_NAME_MISMATCH' };
    }

    let locality: Locality | null;
    if (input.localityId) {
      if (selectedVenue) {
        if (selectedVenue.localityId !== input.localityId)
          return { status: 'invalid', code: 'VENUE_LOCALITY_MISMATCH' };
        locality = selectedVenue.locality ?? null;
      } else {
        locality = await (
          manager?.getRepository(Locality) ??
          this.dataSource.getRepository(Locality)
        ).findOne({
          where: { id: input.localityId },
          relations: {
            administrativeRegion: { country: true },
            aliases: true,
          },
        });
      }
      if (!locality)
        return { status: 'invalid', code: 'LOCALITY_ID_NOT_FOUND' };
    } else {
      locality = selectedVenue?.locality ?? null;
      if (!locality)
        return { status: 'invalid', code: 'VENUE_LOCALITY_NOT_FOUND' };
    }

    const countryId = locality.administrativeRegion?.countryId;
    if (input.countryId && countryId !== input.countryId)
      return {
        status: 'invalid',
        code:
          input.venueId && !input.localityId
            ? 'VENUE_ID_COUNTRY_MISMATCH'
            : 'LOCALITY_ID_COUNTRY_MISMATCH',
      };
    if (
      input.administrativeRegionId &&
      locality.administrativeRegionId !== input.administrativeRegionId
    )
      return { status: 'invalid', code: 'LOCALITY_ID_REGION_MISMATCH' };

    const cityKey = normalizeGeography(input.city);
    const localityNames = new Set([
      locality.nameNormalized,
      ...(locality.aliases ?? []).map((alias) => alias.normalizedName),
    ]);
    if (!localityNames.has(cityKey))
      return { status: 'invalid', code: 'LOCALITY_ID_NAME_MISMATCH' };

    const provinceKey = normalizeGeography(input.province ?? '');
    if (
      provinceKey &&
      locality.provinceNormalized &&
      locality.provinceNormalized !== provinceKey
    )
      return { status: 'invalid', code: 'LOCALITY_ID_PROVINCE_MISMATCH' };

    return {
      status: 'existing',
      entity: locality,
      ...(selectedVenue ? { selectedVenue } : {}),
    };
  }

  async inspectTour(name: string): Promise<ImportResolution<Tour>> {
    const normalizedName = normalizeGeography(name);
    if (!name.trim() || name.trim().length > 180 || !normalizedName)
      return { status: 'invalid', code: 'TOUR_NAME_INVALID' };
    const tour = await this.dataSource
      .getRepository(Tour)
      .findOneBy({ normalizedName });
    return tour
      ? { status: 'conflict', code: 'TOUR_CONFIRMATION_REQUIRED', entity: tour }
      : { status: 'created' };
  }

  async materializeTour(
    name: string,
    confirmedTourId: string | null,
    manager: EntityManager,
    context?: ImportTourResolutionContext,
  ): Promise<ImportResolution<Tour>> {
    const cleanName = name.trim().replace(/\s+/gu, ' ');
    const normalizedName = normalizeGeography(cleanName);
    if (!normalizedName || cleanName.length > 180)
      return { status: 'invalid', code: 'TOUR_NAME_INVALID' };
    const repo = manager.getRepository(Tour);
    const existing = await repo.findOneBy({ normalizedName });
    if (
      existing &&
      context?.createdTours.get(normalizedName)?.id === existing.id
    )
      return { status: 'existing', entity: existing };
    if (existing)
      return confirmedTourId === existing.id
        ? { status: 'existing', entity: existing }
        : {
            status: 'conflict',
            code: 'TOUR_CONFIRMATION_REQUIRED',
            entity: existing,
          };
    if (confirmedTourId)
      return { status: 'conflict', code: 'TOUR_CONFIRMATION_STALE' };
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 731907))',
      [normalizedName],
    );
    const raced = await repo.findOneBy({ normalizedName });
    if (raced)
      return {
        status: 'conflict',
        code: 'TOUR_CONFIRMATION_REQUIRED',
        entity: raced,
      };
    const inserted = (await manager.query(
      `INSERT INTO "tours" ("name", "normalized_name", "description")
       VALUES ($1, $2, NULL)
       ON CONFLICT ("normalized_name") DO NOTHING
       RETURNING "id"`,
      [cleanName, normalizedName],
    )) as Array<{ id: string }>;
    const tour = inserted[0]
      ? await repo.findOneBy({ id: inserted[0].id })
      : await repo.findOneBy({ normalizedName });
    if (!tour) return { status: 'conflict', code: 'TOUR_CONCURRENT_COLLISION' };
    if (!inserted[0])
      return {
        status: 'conflict',
        code: 'TOUR_CONFIRMATION_REQUIRED',
        entity: tour,
      };
    context?.createdTours.set(normalizedName, tour);
    return { status: 'created', entity: tour };
  }

  private async inspectLocalityWithManager(
    input: ImportLocalityInput,
    manager: EntityManager,
  ): Promise<ImportResolution<Locality>> {
    const city = input.city.trim().replace(/\s+/gu, ' ');
    if (!city) return { status: 'invalid', code: 'LOCALITY_NAME_INVALID' };
    const nameKey = normalizeGeography(city);
    const provinceKey = input.province
      ? normalizeGeography(input.province)
      : null;
    const rows = await manager
      .getRepository(Locality)
      .createQueryBuilder('locality')
      .leftJoinAndSelect('locality.administrativeRegion', 'region')
      .leftJoinAndSelect('region.country', 'country')
      .where(
        '(locality.nameNormalized = :nameKey OR EXISTS (SELECT 1 FROM locality_aliases alias WHERE alias.locality_id = locality.id AND alias.normalized_name = :nameKey))',
        { nameKey },
      )
      .andWhere(
        input.administrativeRegionId
          ? 'locality.administrativeRegionId = :regionId'
          : '1 = 1',
        { regionId: input.administrativeRegionId },
      )
      .andWhere(input.countryId ? 'region.countryId = :countryId' : '1 = 1', {
        countryId: input.countryId,
      })
      .andWhere(
        provinceKey
          ? '(locality.provinceNormalized = :provinceKey OR locality.provinceNormalized = :empty)'
          : '1 = 1',
        { provinceKey, empty: '' },
      )
      .getMany();
    const distinct = [...new Map(rows.map((row) => [row.id, row])).values()];
    if (distinct.length > 1)
      return { status: 'ambiguous', code: 'LOCALITY_AMBIGUOUS' };
    if (distinct[0]) return { status: 'existing', entity: distinct[0] };
    const region = input.administrativeRegionId
      ? await manager
          .getRepository(AdministrativeRegion)
          .findOneBy({ id: input.administrativeRegionId })
      : null;
    if (!region || (input.countryId && region.countryId !== input.countryId))
      return { status: 'invalid', code: 'LOCALITY_CONTEXT_REQUIRED' };
    return { status: 'created' };
  }

  private async findLocalityMatch(
    manager: EntityManager,
    nameNormalized: string,
    provinceNormalized: string,
    regionId: string,
  ): Promise<Locality | null> {
    const rows = await manager
      .getRepository(Locality)
      .find({ where: { administrativeRegionId: regionId, nameNormalized } });
    return (
      rows.find((row) => row.provinceNormalized === provinceNormalized) ??
      rows.find((row) => row.provinceNormalized === '')
    );
  }
}
