import { SelectQueryBuilder } from 'typeorm';
import { DiscListOptionsCriteria } from '../types/disc-list-options';

export interface DiscListFilterOptions {
  omitCountry?: boolean;
  omitGenre?: boolean;
  countryColumn?: 'country.id' | 'artist.countryId';
}

export function applyDiscListFilters<Entity extends object>(
  queryBuilder: SelectQueryBuilder<Entity>,
  criteria: DiscListOptionsCriteria,
  options: DiscListFilterOptions = {},
): void {
  if (criteria.dateRange && criteria.dateRange.length === 2) {
    queryBuilder.andWhere(
      'disc.releaseDate BETWEEN :discListStartDate AND :discListEndDate',
      {
        discListStartDate: criteria.dateRange[0],
        discListEndDate: criteria.dateRange[1],
      },
    );
  }

  if (criteria.query) {
    const search = `%${criteria.query}%`;
    queryBuilder.andWhere(
      '(disc.name ILIKE :discListSearch OR artist.name ILIKE :discListSearch)',
      { discListSearch: search },
    );
  }

  if (!options.omitGenre && criteria.genreId) {
    queryBuilder.andWhere('disc.genreId = :discListGenreId', {
      discListGenreId: criteria.genreId,
    });
  }

  if (!options.omitCountry && criteria.countryId) {
    const countryColumn = options.countryColumn ?? 'country.id';
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        criteria.countryId,
      );
    const field =
      countryColumn === 'artist.countryId'
        ? countryColumn
        : isUUID
          ? countryColumn
          : 'country.name';
    queryBuilder.andWhere(`${field} = :discListCountryId`, {
      discListCountryId: criteria.countryId,
    });
  }
}
