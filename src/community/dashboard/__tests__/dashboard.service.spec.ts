import { DiscCatalogService } from '../../../catalog/discs/catalog/disc-catalog.service';
import { CommunityDashboardRatesService } from '../../rates/stats/community-dashboard-rates.service';
import { CommunityDashboardService } from '../dashboard.service';

describe('CommunityDashboardService', () => {
  it('delegates rankings alone without requesting modal statistics', async () => {
    const rates: Pick<
      CommunityDashboardRatesService,
      'getRankings' | 'getStats'
    > = {
      getRankings: jest.fn().mockResolvedValue({
        year: 2026,
        topUsersByRates: [],
        topUsersByCover: [],
      }),
      getStats: jest.fn(),
    };
    const catalog: Pick<DiscCatalogService, 'countDiscsReleasedInYear'> = {
      countDiscsReleasedInYear: jest.fn(),
    };
    const service = new CommunityDashboardService(rates, catalog);

    await expect(service.getRankings(2026)).resolves.toEqual({
      year: 2026,
      topUsersByRates: [],
      topUsersByCover: [],
    });
    expect(rates.getStats).not.toHaveBeenCalled();
    expect(catalog.countDiscsReleasedInYear).not.toHaveBeenCalled();
  });

  it('combines only the independent stats aggregate and Catalog release count', async () => {
    const rates: Pick<
      CommunityDashboardRatesService,
      'getRankings' | 'getStats'
    > = {
      getRankings: jest.fn(),
      getStats: jest.fn().mockResolvedValue({
        year: 2027,
        summary: { ratedDiscs: 1, participatingUsers: 1, averageRating: null },
        ratingDistribution: [],
        currentStreaks: [],
        topGenre: null,
      }),
    };
    const catalog: Pick<DiscCatalogService, 'countDiscsReleasedInYear'> = {
      countDiscsReleasedInYear: jest.fn().mockResolvedValue(12),
    };
    const service = new CommunityDashboardService(rates, catalog);

    await expect(service.getStats(2027)).resolves.toMatchObject({
      summary: {
        ratedDiscs: 1,
        releasedDiscs: 12,
        participatingUsers: 1,
        averageRating: null,
      },
    });
    expect(rates.getRankings).not.toHaveBeenCalled();
    expect(catalog.countDiscsReleasedInYear).toHaveBeenCalledWith(2027);
  });
});
