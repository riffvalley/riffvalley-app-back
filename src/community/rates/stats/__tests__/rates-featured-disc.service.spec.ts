import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesFeaturedDiscService } from '../rates-featured-disc.service';
import { RatesControversialDiscsService } from '../rates-controversial-discs.service';

interface QueryRow {
  id: string;
  name: string;
  image: string | null;
  rate?: string | number;
  userRate?: string | number;
  communityAverage?: string | number;
  communityRateCount?: string | number;
  artistName: string | null;
  genreName: string | null;
  genreColor: string | null;
  groupType?: 'overall' | 'month' | 'genre';
  groupValue?: string;
}

function createRepositories(rows: QueryRow[] = []): {
  rateRepository: Repository<Rate>;
  eventRepository: Repository<RateVoteEvent>;
  rateQuery: jest.Mock<Promise<QueryRow[]>, [string, unknown[]?]>;
  eventQuery: jest.Mock<Promise<QueryRow[]>, [string, unknown[]?]>;
} {
  const manager = new EntityManager(
    new DataSource({ type: 'postgres', database: 'rates-featured-disc' }),
  );
  const rateRepository = new Repository<Rate>(Rate, manager);
  const eventRepository = new Repository<RateVoteEvent>(RateVoteEvent, manager);
  const rateQuery = jest
    .fn<Promise<QueryRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  const eventQuery = jest
    .fn<Promise<QueryRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  Object.assign(rateRepository, { query: rateQuery });
  Object.assign(eventRepository, { query: eventQuery });
  return { rateRepository, eventRepository, rateQuery, eventQuery };
}

const discRow: QueryRow = {
  id: 'disc-id',
  name: 'Example record',
  image: null,
  rate: '9.25',
  artistName: 'Example artist',
  genreName: null,
  genreColor: null,
};

describe('RatesFeaturedDiscService', () => {
  it.each([
    { year: 2025, repository: 'rate' },
    { year: 2026, repository: 'rate' },
    { year: 2027, repository: 'event' },
  ])(
    'uses the shared $year eligible score population',
    async ({ year, repository }) => {
      const repositories = createRepositories([discRow]);
      const service = new RatesFeaturedDiscService(
        repositories.rateRepository,
        repositories.eventRepository,
      );

      await service.selectForUser('user-id', year, 'Europe/Madrid');

      expect(
        repository === 'rate'
          ? repositories.rateQuery
          : repositories.eventQuery,
      ).toHaveBeenCalledTimes(1);
      expect(
        repository === 'rate'
          ? repositories.eventQuery
          : repositories.rateQuery,
      ).not.toHaveBeenCalled();
    },
  );

  it('returns the contract disc projection and orders score, latest eligible assignment, then stable disc ID', async () => {
    const repositories = createRepositories([discRow]);
    const service = new RatesFeaturedDiscService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await expect(service.selectForUser('user-id', 2026)).resolves.toEqual({
      id: 'disc-id',
      name: 'Example record',
      image: null,
      rate: 9.25,
      artist: { name: 'Example artist' },
      genre: null,
    });
    const sql = repositories.rateQuery.mock.calls[0][0];
    expect(sql).toContain('ORDER BY current_scores."currentRate" DESC');
    expect(sql).toContain('current_scores."eligibleAt" DESC, disc.id ASC');
    expect(sql).toContain('rateId" DESC');
    expect(sql).toContain('disc."releaseDate" >= $2::date');
    expect(sql).toContain('WHERE rate."userId" = $1');
  });

  it('returns null when no valid eligible current Rate exists', async () => {
    const repositories = createRepositories();
    const service = new RatesFeaturedDiscService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await expect(service.selectForUser('user-id', 2025)).resolves.toBeNull();
  });

  it('returns monthly and current-genre highlights with nullable catalogue covers', async () => {
    const rows: QueryRow[] = [
      { ...discRow, groupType: 'overall', groupValue: null },
      { ...discRow, groupType: 'month', groupValue: '2026-03' },
      {
        ...discRow,
        image: 'catalog-cover.jpg',
        genreName: 'Black Metal',
        groupType: 'genre',
        groupValue: 'Black Metal',
      },
    ];
    const repositories = createRepositories(rows);
    const service = new RatesFeaturedDiscService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await expect(
      service.selectAnnualHighlightsForUser('user-id', 2026),
    ).resolves.toEqual({
      topDiscOverall: {
        id: 'disc-id',
        name: 'Example record',
        image: null,
        rate: 9.25,
        artist: { name: 'Example artist' },
        genre: null,
      },
      byMonth: [
        {
          month: '2026-03',
          topDisc: {
            id: 'disc-id',
            name: 'Example record',
            image: null,
            rate: 9.25,
            artist: { name: 'Example artist' },
            genre: null,
          },
        },
      ],
      byGenre: [
        {
          genre: 'Black Metal',
          topDisc: {
            id: 'disc-id',
            name: 'Example record',
            image: 'catalog-cover.jpg',
            rate: 9.25,
            artist: { name: 'Example artist' },
            genre: { name: 'Black Metal', color: null },
          },
        },
      ],
    });
    const [sql, parameters] = repositories.rateQuery.mock.calls[0];
    expect(sql).toContain('eligible_rate_rows."createdAtLocal"');
    expect(sql).toContain('PARTITION BY genre.name');
    expect(sql).toContain('ORDER BY current_scores."currentRate" DESC');
    expect(sql).toContain('disc.image');
    expect(parameters?.[0]).toBe('user-id');
  });

  it('assigns monthly event highlights in the requested local zone and preserves repeated-set eligibility', async () => {
    const repositories = createRepositories([discRow]);
    const service = new RatesFeaturedDiscService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await service.selectGroupHighlightsForUser(
      'user-id',
      2027,
      'Europe/Madrid',
    );
    const [sql, parameters] = repositories.eventQuery.mock.calls[0];
    expect(sql).toContain('eligible_set_events event');
    expect(sql).toContain('event."occurredAt" AT TIME ZONE $7');
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('current_scores."eligibleAt" DESC, disc.id ASC');
    expect(parameters?.[6]).toBe('Europe/Madrid');
  });

  it('preserves an eligible disc when its artist is missing', async () => {
    const repositories = createRepositories([{ ...discRow, artistName: null }]);
    const service = new RatesFeaturedDiscService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await expect(service.selectForUser('user-id', 2026)).resolves.toMatchObject(
      {
        id: 'disc-id',
        artist: null,
      },
    );
    expect(repositories.rateQuery.mock.calls[0][0]).toContain(
      'LEFT JOIN artist ON artist.id = disc."artistId"',
    );
  });

  it('uses the latest eligible set event to resolve equal personal scores after deduplicating repeated events', async () => {
    const repositories = createRepositories([discRow]);
    const service = new RatesFeaturedDiscService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await service.selectForUser('user-id', 2027, 'Europe/Madrid');
    const sql = repositories.eventQuery.mock.calls[0][0];
    expect(sql).toContain('MAX("occurredAt") AS "eligibleAt"');
    expect(sql).toContain('GROUP BY "discId"');
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('event.previous_value IS NULL');
    expect(sql).toContain('event.new_value IS NOT NULL');
    expect(sql).toContain('rate.id DESC');
  });
});

describe('RatesControversialDiscsService', () => {
  it('calculates signed discrepancy, keeps community count, and preserves response identity fields', async () => {
    const repositories = createRepositories([
      {
        ...discRow,
        userRate: '9.00',
        communityAverage: '6.00',
        communityRateCount: '3',
      },
    ]);
    const service = new RatesControversialDiscsService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await expect(service.analyzeForUser('user-id', 2026)).resolves.toEqual([
      {
        id: 'disc-id',
        name: 'Example record',
        image: null,
        userRate: 9,
        communityAverage: 6,
        diff: 3,
        communityRateCount: 3,
        artist: { name: 'Example artist' },
        genre: null,
      },
    ]);
  });

  it('preserves controversy candidates when the artist relation is missing', async () => {
    const repositories = createRepositories([
      {
        ...discRow,
        artistName: null,
        userRate: '9.00',
        communityAverage: '6.00',
        communityRateCount: '5',
      },
    ]);
    const service = new RatesControversialDiscsService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await expect(
      service.analyzeForUser('user-id', 2026),
    ).resolves.toMatchObject([{ id: 'disc-id', artist: null }]);
    expect(repositories.rateQuery.mock.calls[0][0]).toContain(
      'LEFT JOIN artist ON artist.id = disc."artistId"',
    );
  });

  it('keeps a negative discrepancy signed when the user score is below the community mean', async () => {
    const repositories = createRepositories([
      {
        ...discRow,
        userRate: '3.00',
        communityAverage: '6.00',
        communityRateCount: '5',
      },
    ]);
    const service = new RatesControversialDiscsService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    const results = await service.analyzeForUser('user-id', 2026);
    expect(results[0].diff).toBe(-3);
  });

  it('uses signed score difference and magnitude ordering with count and disk ID tie-breaks', async () => {
    const repositories = createRepositories();
    const service = new RatesControversialDiscsService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await service.analyzeForUser('user-id', 2027, 'UTC');
    const sql = repositories.eventQuery.mock.calls[0][0];
    expect(sql).toContain('userRate" -');
    expect(sql).toContain('ABS(eligible_personal_scores."userRate" -');
    expect(sql).toContain(
      'community_averages."communityRateCount" DESC, disc.id ASC',
    );
  });

  it('deduplicates community Rates per user/disc before validating the winning note', async () => {
    const repositories = createRepositories();
    const service = new RatesControversialDiscsService(
      repositories.rateRepository,
      repositories.eventRepository,
    );

    await service.analyzeForUser('user-id', 2026);
    const sql = repositories.rateQuery.mock.calls[0][0];
    expect(sql).toContain(
      'PARTITION BY community_rate."discId", community_rate."userId"',
    );
    expect(sql).toContain('community_rate."editedAt" DESC NULLS LAST');
    expect(sql).toContain(
      'community_rate."createdAt" DESC, community_rate.id DESC',
    );
    expect(sql).toContain('WHERE current_position = 1');
    expect(sql).toContain('"communityRate" IS NOT NULL');
    expect(sql).toContain('"communityRate" >= 0 AND "communityRate" <= 10');
    expect(sql).toContain('(COUNT(*) + 1)::int AS "communityRateCount"');
    expect(sql).toContain('community_rate."userId" <> $8');
    expect(sql).toContain('HAVING COUNT(*) >= 4');
    expect(sql).toContain('SUM(valid_community_rates."communityRate") +');
    expect(sql).toContain('eligible_personal_scores."userRate"');
    expect(sql).toContain(
      'community_averages."communityRateCount" DESC, disc.id ASC',
    );
    expect(sql).toContain('LIMIT 5');
    expect(repositories.rateQuery.mock.calls[0][1]?.[7]).toBe('user-id');
    expect(sql).not.toContain('community_rate.cover');
  });

  it('returns no controversy candidates when no eligible personal discs exist', async () => {
    const repositories = createRepositories();
    const service = new RatesControversialDiscsService(
      repositories.rateRepository,
      repositories.eventRepository,
    );
    await expect(service.analyzeForUser('user-id', 2025)).resolves.toEqual([]);
  });
});
