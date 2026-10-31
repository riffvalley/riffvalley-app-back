import { RatesDashboardSummaryService } from '../rates-dashboard-summary.service';

describe('RatesDashboardSummaryService', () => {
  it('returns null musical statistics and an empty recent list when no data exists', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        activeRates: 0,
        averageMusicalRate: null,
        distinctGenres: 0,
        previousRates: 0,
        bestRatedDisc: null,
        dominantGenre: null,
        recentRates: [],
      },
    ]);
    const service = new RatesDashboardSummaryService({ query });

    const result = await service.getSummary(
      'user-current-session',
      new Date('2026-10-27T12:00:00.000Z'),
    );

    expect(result).toEqual({
      period: {
        start: '2026-10-25T23:00:00.000Z',
        endExclusive: '2026-11-01T23:00:00.000Z',
        timezone: 'Europe/Madrid',
      },
      metrics: {
        activeRates: 0,
        averageMusicalRate: null,
        distinctGenres: 0,
        bestRatedDisc: null,
        dominantGenre: null,
        weekOverWeek: {
          currentRates: 0,
          previousRates: 0,
          difference: 0,
          percentageChange: null,
        },
      },
      recentRates: [],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 5'), [
      'user-current-session',
      new Date('2026-10-25T23:00:00.000Z'),
      new Date('2026-11-01T23:00:00.000Z'),
      new Date('2026-10-18T22:00:00.000Z'),
    ]);
  });

  it('maps current zero notes, cover-only Rates, genre values and week comparison', async () => {
    const recentRates = [
      {
        id: 'rate-cover-only',
        discId: 'disc-2',
        discName: 'Cover-only album',
        artist: null,
        coverImage: null,
        rate: null,
        cover: 8.5,
        lastActivityAt: '2026-10-26T10:00:00.000Z',
      },
    ];
    const query = jest.fn().mockResolvedValue([
      {
        activeRates: '3',
        averageMusicalRate: '0.00',
        distinctGenres: '1',
        previousRates: '2',
        bestRatedDisc: JSON.stringify({
          rateId: 'rate-1',
          discId: 'disc-1',
          discName: 'Zero-rated album',
          artist: { id: 'artist-1', name: 'Artist' },
          coverImage: null,
          rate: 0,
        }),
        dominantGenre: {
          id: 'genre-1',
          name: 'Rock',
          activeRates: 2,
        },
        recentRates: JSON.stringify(recentRates),
      },
    ]);
    const service = new RatesDashboardSummaryService({ query });

    const result = await service.getSummary(
      'session-user',
      new Date('2026-10-27T12:00:00Z'),
    );

    expect(result.metrics).toEqual({
      activeRates: 3,
      averageMusicalRate: 0,
      distinctGenres: 1,
      bestRatedDisc: {
        rateId: 'rate-1',
        discId: 'disc-1',
        discName: 'Zero-rated album',
        artist: { id: 'artist-1', name: 'Artist' },
        coverImage: null,
        rate: 0,
      },
      dominantGenre: { id: 'genre-1', name: 'Rock', activeRates: 2 },
      weekOverWeek: {
        currentRates: 3,
        previousRates: 2,
        difference: 1,
        percentageChange: 50,
      },
    });
    expect(result.recentRates).toEqual(recentRates);
    expect(query.mock.calls[0][1]?.[0]).toBe('session-user');
  });

  it('counts set events for weekly rate activity while keeping score stats scoped to recently active rates', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        activeRates: 1,
        averageMusicalRate: '7.50',
        distinctGenres: 0,
        previousRates: 0,
        bestRatedDisc: null,
        dominantGenre: null,
        recentRates: [],
      },
    ]);
    const service = new RatesDashboardSummaryService({ query });

    await service.getSummary(
      'private-user-id',
      new Date('2026-10-27T12:00:00Z'),
    );

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE r."userId" = $1::uuid');
    expect(sql).toContain(
      'GREATEST(r."createdAt", COALESCE(r."editedAt", r."createdAt"))',
    );
    expect(sql).toContain('COUNT(DISTINCT genre_id)');
    expect(sql).toContain('AVG(musical_rate)');
    expect(sql).toContain(
      'WHERE musical_rate IS NOT NULL AND disc_id IS NOT NULL',
    );
    expect(sql).toContain('WHERE genre_id IS NOT NULL');
    expect(sql).toContain(
      'ORDER BY musical_rate DESC, disc_name ASC NULLS LAST, disc_id ASC, rate_id ASC',
    );
    expect(sql).toContain(
      'ORDER BY active_rates DESC, genre_name ASC, genre_id ASC',
    );
    expect(sql).toContain('ORDER BY last_activity DESC, rate_id ASC');
    expect(sql).toContain('last_activity >= bounds.previous_week_start');
    expect(sql).toContain('last_activity < bounds.week_start');
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('event.user_id = $1::uuid');
    expect(sql).toContain('COUNT(DISTINCT event.disc_id)::int');
    expect(sql.match(/event\.disc_id IS NOT NULL/gu)).toHaveLength(2);
    expect(sql).toContain('event.occurred_at >= $2::timestamptz');
    expect(sql).toContain('event.occurred_at < $3::timestamptz');
    expect(sql).toContain('event.occurred_at >= $4::timestamptz');
    expect(sql).toContain('event.occurred_at < $2::timestamptz');
    expect(sql).toContain('LEFT JOIN disc d ON d.id = r."discId"');
    expect(sql).toContain('LEFT JOIN artist a ON a.id = d."artistId"');
    expect(sql).toContain('LEFT JOIN genre g ON g.id = d."genreId"');
    expect(sql).toContain('LIMIT 5');
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
