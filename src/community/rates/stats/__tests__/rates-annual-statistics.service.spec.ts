import { RatesAnnualStatisticsService } from '../rates-annual-statistics.service';
import { RatesHistoricalAggregationsService } from '../rates-historical-aggregations.service';
import { RatesEventSetAggregationsService } from '../rates-event-set-aggregations.service';
import { RatesCurrentScoresService } from '../rates-current-scores.service';
import { RatesFeaturedDiscService } from '../rates-featured-disc.service';
import { RatesControversialDiscsService } from '../rates-controversial-discs.service';
import { RatesGalaxyDiscsService } from '../rates-galaxy-discs.service';

const activity = (year: number) => ({
  year,
  activityCount: 0,
  activityByMonth: Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, '0')}`,
    activityCount: 0,
  })),
  activityByDay: [],
  activityByGenre: [],
  activityWithoutGenre: 0,
});

const scores = (year: number) => ({
  year,
  scoredDiscs: 0,
  mean: null,
  median: null,
  standardDeviation: null,
  scoreDistribution: Array.from({ length: 11 }, (_, score) => ({
    score,
    scoredDiscCount: 0,
  })),
});

function createService() {
  const calls: string[] = [];
  const historical = Object.assign(
    Object.create(
      RatesHistoricalAggregationsService.prototype,
    ) as RatesHistoricalAggregationsService,
    {
      aggregateActivityForUser: jest.fn(
        async (userId: string, year: number) => {
          calls.push('historical');
          expect(userId).toBe('session-user');
          return activity(year);
        },
      ),
    },
  );
  const modern = Object.assign(
    Object.create(
      RatesEventSetAggregationsService.prototype,
    ) as RatesEventSetAggregationsService,
    {
      aggregateActivityForUser: jest.fn(
        async (userId: string, year: number, timeZone?: string) => {
          calls.push('modern');
          expect(userId).toBe('session-user');
          expect(timeZone).toBe('America/Los_Angeles');
          return { ...activity(year), timeZone: timeZone ?? 'UTC' };
        },
      ),
    },
  );
  const currentScores = Object.assign(
    Object.create(
      RatesCurrentScoresService.prototype,
    ) as RatesCurrentScoresService,
    {
      aggregateForUser: jest.fn(
        async (userId: string, year: number, zone?: string) => {
          calls.push('scores');
          expect(userId).toBe('session-user');
          expect(zone).toBe('America/Los_Angeles');
          return scores(year);
        },
      ),
    },
  );
  const featured = Object.assign(
    Object.create(
      RatesFeaturedDiscService.prototype,
    ) as RatesFeaturedDiscService,
    {
      selectForUser: jest.fn(
        async (userId: string, year: number, zone?: string) => {
          calls.push('featured');
          expect(userId).toBe('session-user');
          expect(zone).toBe('America/Los_Angeles');
          expect(year).toBeGreaterThanOrEqual(2025);
          return null;
        },
      ),
      selectAnnualHighlightsForUser: jest.fn(
        async (userId: string, year: number, zone?: string) => {
          calls.push('featured');
          expect(userId).toBe('session-user');
          expect(year).toBeGreaterThanOrEqual(2025);
          expect(zone).toBe('America/Los_Angeles');
          return { topDiscOverall: null, byMonth: [], byGenre: [] };
        },
      ),
    },
  );
  const controversial = Object.assign(
    Object.create(
      RatesControversialDiscsService.prototype,
    ) as RatesControversialDiscsService,
    {
      analyzeForUser: jest.fn(
        async (userId: string, year: number, zone?: string) => {
          calls.push('controversy');
          expect(userId).toBe('session-user');
          expect(zone).toBe('America/Los_Angeles');
          expect(year).toBeGreaterThanOrEqual(2025);
          return [];
        },
      ),
    },
  );
  const galaxy = Object.assign(
    Object.create(RatesGalaxyDiscsService.prototype) as RatesGalaxyDiscsService,
    {
      selectForUser: jest.fn(
        async (userId: string, year: number, zone?: string) => {
          calls.push('galaxy');
          expect(userId).toBe('session-user');
          expect(zone).toBe('America/Los_Angeles');
          return [];
        },
      ),
    },
  );
  return {
    service: new RatesAnnualStatisticsService(
      historical,
      modern,
      currentScores,
      featured,
      controversial,
      galaxy,
    ),
    historical,
    modern,
    currentScores,
    featured,
    controversial,
    galaxy,
    calls,
  };
}

describe('RatesAnnualStatisticsService', () => {
  it.each([2025, 2026])(
    'composes the historical estimate for %s',
    async (year) => {
      const setup = createService();
      const result = await setup.service.getUserStats(
        'session-user',
        year,
        'America/Los_Angeles',
      );

      expect(setup.historical.aggregateActivityForUser).toHaveBeenCalledWith(
        'session-user',
        year,
      );
      expect(setup.modern.aggregateActivityForUser).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        year,
        timeZone: 'America/Los_Angeles',
        activityBasis: 'rate_created_at_estimate',
        activityCoverage: 'unknown',
        activityCount: 0,
        scoredDiscs: 0,
        mean: null,
        median: null,
        activityByMonth: expect.arrayContaining([
          { month: `${year}-01`, activityCount: 0, topDisc: null },
          { month: `${year}-12`, activityCount: 0, topDisc: null },
        ]),
        activityByDay: [],
        activityByGenre: [],
        activityWithoutGenre: 0,
        scoreDistribution: expect.arrayContaining([
          { score: 0, scoredDiscCount: 0 },
          { score: 10, scoredDiscCount: 0 },
        ]),
        topDiscOverall: null,
        mostControversial: [],
      });
      expect(result.activityByMonth).toHaveLength(12);
      expect(setup.calls).toEqual([
        'historical',
        'scores',
        'featured',
        'controversy',
      ]);
      expect(setup.featured.selectAnnualHighlightsForUser).toHaveBeenCalledWith(
        'session-user',
        year,
        'America/Los_Angeles',
      );
    },
  );

  it('uses set event activity from 2027 and propagates year and zone to all current-score services', async () => {
    const setup = createService();
    const result = await setup.service.getUserStats(
      'session-user',
      2027,
      'America/Los_Angeles',
    );

    expect(setup.modern.aggregateActivityForUser).toHaveBeenCalledWith(
      'session-user',
      2027,
      'America/Los_Angeles',
    );
    expect(setup.historical.aggregateActivityForUser).not.toHaveBeenCalled();
    expect(setup.currentScores.aggregateForUser).toHaveBeenCalledWith(
      'session-user',
      2027,
      'America/Los_Angeles',
    );
    expect(setup.featured.selectAnnualHighlightsForUser).toHaveBeenCalledWith(
      'session-user',
      2027,
      'America/Los_Angeles',
    );
    expect(setup.controversial.analyzeForUser).toHaveBeenCalledWith(
      'session-user',
      2027,
      'America/Los_Angeles',
    );
    expect(result).toMatchObject({
      activityBasis: 'set_events',
      activityCoverage: 'partial',
    });
  });

  it('keeps activity when the cohort has no current scored discs', async () => {
    const setup = createService();
    setup.historical.aggregateActivityForUser.mockResolvedValueOnce({
      ...activity(2026),
      activityCount: 2,
      activityByMonth: activity(2026).activityByMonth.map((item, index) =>
        index === 2 ? { ...item, activityCount: 2 } : item,
      ),
      activityByDay: [
        {
          date: '2026-03-14',
          activityCount: 2,
          assignments: [
            {
              discId: 'disc-1',
              title: 'Album one',
              artist: null,
              rate: null,
              date: '2026-03-14',
            },
            {
              discId: 'disc-1',
              title: 'Album one',
              artist: null,
              rate: null,
              date: '2026-03-14',
            },
          ],
        },
      ],
      activityByGenre: [{ genre: 'Rock', activityCount: 1 }],
      activityWithoutGenre: 1,
    });

    const result = await setup.service.getUserStats(
      'session-user',
      2026,
      'America/Los_Angeles',
    );

    expect(result).toMatchObject({
      activityCount: 2,
      activityByMonth: expect.arrayContaining([
        { month: '2026-03', activityCount: 2, topDisc: null },
      ]),
      activityByDay: [
        {
          date: '2026-03-14',
          activityCount: 2,
          assignments: expect.arrayContaining([
            expect.objectContaining({ discId: 'disc-1', rate: null }),
            expect.objectContaining({ discId: 'disc-1', rate: null }),
          ]),
        },
      ],
      activityByGenre: [{ genre: 'Rock', activityCount: 1, topDisc: null }],
      activityWithoutGenre: 1,
      scoredDiscs: 0,
      mean: null,
      median: null,
      standardDeviation: null,
      topDiscOverall: null,
      mostControversial: [],
    });
  });

  it('uses the galaxy service directly and propagates errors', async () => {
    const setup = createService();
    await expect(
      setup.service.getRatedDiscs('session-user', 2027, 'America/Los_Angeles'),
    ).resolves.toEqual([]);
    expect(setup.galaxy.selectForUser).toHaveBeenCalledWith(
      'session-user',
      2027,
      'America/Los_Angeles',
    );
    const failure = new Error('database unavailable');
    setup.galaxy.selectForUser.mockRejectedValueOnce(failure);
    await expect(
      setup.service.getRatedDiscs('session-user', 2027, 'America/Los_Angeles'),
    ).rejects.toBe(failure);
  });

  it('propagates component failures without returning a partial response', async () => {
    const setup = createService();
    const failure = new Error('activity query failed');
    setup.modern.aggregateActivityForUser.mockRejectedValueOnce(failure);
    await expect(
      setup.service.getUserStats('session-user', 2027, 'America/Los_Angeles'),
    ).rejects.toBe(failure);
    expect(setup.currentScores.aggregateForUser).not.toHaveBeenCalled();
  });
});
