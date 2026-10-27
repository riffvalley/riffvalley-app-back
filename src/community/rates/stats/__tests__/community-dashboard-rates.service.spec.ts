import { Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { CommunityDashboardRatesService } from '../community-dashboard-rates.service';

describe('CommunityDashboardRatesService', () => {
  let rates: jest.Mocked<Pick<Repository<Rate>, 'query'>>;
  let events: jest.Mocked<Pick<Repository<RateVoteEvent>, 'query'>>;
  let service: CommunityDashboardRatesService;

  beforeEach(() => {
    rates = { query: jest.fn() };
    events = { query: jest.fn() };
    service = new CommunityDashboardRatesService(rates, events);
  });

  it('returns historical distinct-disc rankings and preserves cover row-count semantics', async () => {
    rates.query
      .mockResolvedValueOnce([{ userId: 'u1', username: 'A', count: '3' }])
      .mockResolvedValueOnce([{ userId: 'u2', username: 'B', count: '4' }]);

    await expect(service.getRankings(2026)).resolves.toEqual({
      year: 2026,
      topUsersByRates: [{ user: { id: 'u1', username: 'A' }, rateCount: 3 }],
      topUsersByCover: [{ user: { id: 'u2', username: 'B' }, totalCover: 4 }],
    });
    expect(events.query).not.toHaveBeenCalled();
    expect(rates.query.mock.calls[0][0]).toContain(
      'COUNT(DISTINCT r."discId")',
    );
    expect(rates.query.mock.calls[0][0]).toContain('r.rate IS NOT NULL');
    expect(rates.query.mock.calls[0][0]).toContain(
      'ORDER BY count DESC, u.username ASC, u.id ASC',
    );
    expect(rates.query.mock.calls[1][0]).toContain('r.cover IS NOT NULL');
    expect(rates.query.mock.calls[1][0]).toContain('COUNT(r.id)::int');
  });

  it('uses only Madrid-year set events for 2027 musical ranking', async () => {
    events.query.mockResolvedValueOnce([
      { userId: 'u1', username: 'A', count: '2' },
    ]);
    rates.query.mockResolvedValueOnce([]);

    const result = await service.getRankings(2027);

    expect(result.topUsersByRates[0].rateCount).toBe(2);
    const sql = String(events.query.mock.calls[0][0]);
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('COUNT(DISTINCT event.disc_id)');
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).not.toContain("event.event_type = 'change'");
    expect(sql).toContain('event.new_value IS NOT NULL');
  });

  it('keeps historical modal aggregates on current non-null unique rates and returns fixed bins', async () => {
    rates.query
      .mockResolvedValueOnce([
        { ratedDiscs: '2', participatingUsers: '3', averageRating: '5.25' },
      ])
      .mockResolvedValueOnce([
        { bucket: '0-1', count: '1' },
        { bucket: '>1-3', count: '0' },
        { bucket: '>3-5', count: '2' },
        { bucket: '>5-7', count: '0' },
        { bucket: '>7-10', count: '0' },
        { bucket: '10', count: '0' },
      ])
      .mockResolvedValueOnce([{ id: 'g1', name: 'Rock', ratedDiscs: '2' }]);
    events.query.mockResolvedValueOnce([]);

    await expect(service.getStats(2026)).resolves.toEqual({
      year: 2026,
      summary: { ratedDiscs: 2, participatingUsers: 3, averageRating: 5.25 },
      ratingDistribution: [
        {
          label: '0–1',
          min: 0,
          max: 1,
          minInclusive: true,
          maxInclusive: true,
          count: 1,
        },
        {
          label: '>1–3',
          min: 1,
          max: 3,
          minInclusive: false,
          maxInclusive: true,
          count: 0,
        },
        {
          label: '>3–5',
          min: 3,
          max: 5,
          minInclusive: false,
          maxInclusive: true,
          count: 2,
        },
        {
          label: '>5–7',
          min: 5,
          max: 7,
          minInclusive: false,
          maxInclusive: true,
          count: 0,
        },
        {
          label: '>7–<10',
          min: 7,
          max: 10,
          minInclusive: false,
          maxInclusive: false,
          count: 0,
        },
        {
          label: '10',
          min: 10,
          max: 10,
          minInclusive: true,
          maxInclusive: true,
          count: 0,
        },
      ],
      currentStreaks: [],
      topGenre: { id: 'g1', name: 'Rock', ratedDiscs: 2 },
    });
    expect(rates.query).toHaveBeenCalledTimes(3);
    expect(events.query.mock.calls[0][0]).toContain("event_type = 'set'");
    expect(String(rates.query.mock.calls[0][0])).toContain('AVG(mean_rating)');
    expect(String(rates.query.mock.calls[1][0])).toContain(
      'DISTINCT ON (r."userId", r."discId")',
    );
  });

  it('uses event new_value for post-2026 aggregates and computes active Madrid day streaks', async () => {
    rates.query
      .mockResolvedValueOnce([
        { ratedDiscs: '1', participatingUsers: '1', averageRating: '0' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    events.query.mockResolvedValueOnce([
      { userId: 'u1', username: 'A', days: '2' },
    ]);

    const result = await service.getStats(2027);

    expect(result.summary.averageRating).toBe(0);
    expect(result.currentStreaks).toEqual([
      { user: { id: 'u1', username: 'A' }, days: 2 },
    ]);
    const summarySql = String(rates.query.mock.calls[0][0]);
    expect(summarySql).toContain('event.new_value::numeric AS value');
    expect(summarySql).toContain("event.event_type = 'set'");
    expect(summarySql).not.toContain('FROM rate r');
    expect(summarySql).not.toContain('event.disc_id IS NOT NULL');
    const streakSql = String(events.query.mock.calls[0][0]);
    expect(streakSql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(streakSql).toContain(
      'ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_day)',
    );
    expect(streakSql).toContain('latest_day >=');
  });
});
