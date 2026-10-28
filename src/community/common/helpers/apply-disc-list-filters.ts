import { SelectQueryBuilder } from 'typeorm';
import { buildMusicNameMultiColumnPartialPredicate } from 'src/catalog/shared/music-name/music-name-search';
import { DiscListOptionsCriteria } from '../types/disc-list-options';

export interface DiscListFilterOptions {
  omitCountry?: boolean;
  omitGenre?: boolean;
  countryColumn?: 'country.id' | 'artist.countryId';
}

export function applyDiscListFilters<Entity extends object>(
  queryBuilder: Pick<SelectQueryBuilder<Entity>, 'andWhere'>,
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
    const search = buildMusicNameMultiColumnPartialPredicate(
      criteria.query,
      [
        {
          normalizedColumn: 'disc.search_name_normalized',
          legacyColumn: 'disc.name',
          legacyValue: criteria.query,
          legacyOperator: 'ILIKE',
        },
        {
          normalizedColumn: 'artist.search_name_normalized',
          legacyColumn: 'artist.name',
          legacyValue: criteria.query,
          legacyOperator: 'ILIKE',
        },
      ],
      'discListSearch',
    );
    queryBuilder.andWhere(search.predicate, search.parameters);
  }

  if (!options.omitGenre && criteria.genreIds !== undefined) {
    if (criteria.genreIds.length > 0) {
      queryBuilder.andWhere('disc.genreId IN (:...discListGenreIds)', {
        discListGenreIds: criteria.genreIds,
      });
    }
  } else if (!options.omitGenre && criteria.genreId) {
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
