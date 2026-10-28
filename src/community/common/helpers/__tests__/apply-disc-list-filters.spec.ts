import { SelectQueryBuilder } from 'typeorm';
import { DiscListOptionsCriteria } from '../../types/disc-list-options';
import { applyDiscListFilters } from '../apply-disc-list-filters';

describe('applyDiscListFilters text search', () => {
  function run(query?: string) {
    const queryBuilder: Pick<SelectQueryBuilder<object>, 'andWhere'> = {
      andWhere: jest.fn().mockReturnThis(),
    };
    const criteria: DiscListOptionsCriteria = {
      query,
      dateRange: undefined,
      genreIds: undefined,
      genreId: undefined,
      countryId: undefined,
    };

    applyDiscListFilters(queryBuilder, criteria);
    return queryBuilder.andWhere as jest.Mock;
  }

  it('searches both normalized names and uses legacy ILIKE only for NULL keys', () => {
    const andWhere = run('MOL');

    expect(andWhere).toHaveBeenCalledTimes(1);
    const [predicate, parameters] = andWhere.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(predicate).toContain('disc.search_name_normalized LIKE');
    expect(predicate).toContain('artist.search_name_normalized LIKE');
    expect(predicate).toContain('disc.search_name_normalized IS NULL');
    expect(predicate).toContain('artist.search_name_normalized IS NULL');
    expect(predicate).toContain('disc.name ILIKE');
    expect(predicate).toContain('artist.name ILIKE');
    expect(parameters.discListSearch0).toBe('%mol%');
  });

  it('escapes percent, underscore and backslash as literal query characters', () => {
    const andWhere = run('Echo_%\\');
    const [, parameters] = andWhere.mock.calls[0] as [
      string,
      Record<string, string>,
    ];

    expect(parameters.discListSearch0).toBe('%echo%');
    expect(parameters.discListSearchLegacy0).toBe('%Echo\\_\\%\\\\%');
  });

  it('does not add a broad predicate for a query normalized to empty', () => {
    const andWhere = run('%_\\');

    expect(andWhere).toHaveBeenCalledWith('1 = 0', {});
  });

  it('leaves the reader unfiltered when no query is supplied', () => {
    expect(run()).not.toHaveBeenCalled();
  });
});
