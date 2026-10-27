import { DataSource, EntityManager, Repository } from 'typeorm';
import { UsersService } from '../../../../identity/users/users.service';
import { Rate } from '../../entities/rate.entity';
import { RatesArtistSummaryQueryDto } from '../../dto/rates-artist-summary-query.dto';
import { RatesStatsService } from '../rates-stats.service';

type ArtistSummaryRow = {
  artistId: string;
  artistName: string;
  artistImage: string | null;
  countryId: string | null;
  countryName: string | null;
  countryIsoCode: string | null;
  genres: Array<{ id: string; name: string }>;
  ratedDiscCount: number | string;
  averageRate: number | string | null;
  highestRatedDiscId: string | null;
  highestRatedDiscName: string | null;
  highestRatedDiscRate: number | string | null;
  lowestRatedDiscId: string | null;
  lowestRatedDiscName: string | null;
  lowestRatedDiscRate: number | string | null;
  firstAvailableActivityAt: string | null;
  lastAvailableActivityAt: string | null;
};

type ArtistDiscRow = {
  rateId: string;
  discId: string;
  discName: string;
  discImage: string | null;
  releaseDate: string | null;
  rateValue: number | string;
  cover: number | string | null;
  lastActivityAt: string;
};

function createService(rows: unknown[][]) {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'rates-artist-summary-test',
  });
  const query = jest
    .fn<Promise<unknown>, [string, unknown[]]>()
    .mockResolvedValueOnce(rows[0] ?? [])
    .mockResolvedValueOnce(rows[1] ?? []);
  const repository = Object.assign(
    new Repository<Rate>(Rate, new EntityManager(dataSource)),
    { query },
  );
  const usersService = {
    countUsers: jest.fn<Promise<number>, []>().mockResolvedValue(0),
  } satisfies Pick<UsersService, 'countUsers'>;
  return {
    service: new RatesStatsService(repository, usersService as never),
    query,
  };
}

function artistRow(
  overrides: Partial<ArtistSummaryRow> = {},
): ArtistSummaryRow {
  return {
    artistId: 'artist-1',
    artistName: 'Artist',
    artistImage: null,
    countryId: null,
    countryName: null,
    countryIsoCode: null,
    genres: [],
    ratedDiscCount: 0,
    averageRate: null,
    highestRatedDiscId: null,
    highestRatedDiscName: null,
    highestRatedDiscRate: null,
    lowestRatedDiscId: null,
    lowestRatedDiscName: null,
    lowestRatedDiscRate: null,
    firstAvailableActivityAt: null,
    lastAvailableActivityAt: null,
    ...overrides,
  };
}

describe('RatesStatsService artist summary', () => {
  it('maps artist metadata, personal statistics and a page without exposing Rate entities', async () => {
    const summary = artistRow({
      artistImage: 'artist-image',
      countryId: 'country-1',
      countryName: 'Spain',
      countryIsoCode: 'ES',
      genres: [{ id: 'genre-1', name: 'Rock' }],
      ratedDiscCount: '2',
      averageRate: '8.25',
      highestRatedDiscId: 'disc-1',
      highestRatedDiscName: 'Best',
      highestRatedDiscRate: '9.5',
      lowestRatedDiscId: 'disc-2',
      lowestRatedDiscName: 'Worst',
      lowestRatedDiscRate: '7',
      firstAvailableActivityAt: '2020-01-01T00:00:00.000000',
      lastAvailableActivityAt: '2024-02-03T04:05:06.000000',
    });
    const disc: ArtistDiscRow = {
      rateId: 'rate-2',
      discId: 'disc-2',
      discName: 'Worst',
      discImage: null,
      releaseDate: null,
      rateValue: '7',
      cover: null,
      lastActivityAt: '2024-02-03T04:05:06.000000',
    };
    const { service, query } = createService([[summary], [disc]]);

    await expect(
      service.getArtistSummary(
        'session-user',
        'artist-1',
        Object.assign(new RatesArtistSummaryQueryDto(), { page: 1, limit: 1 }),
      ),
    ).resolves.toEqual({
      artist: {
        id: 'artist-1',
        name: 'Artist',
        image: 'artist-image',
        country: { id: 'country-1', name: 'Spain', isoCode: 'ES' },
        genres: [{ id: 'genre-1', name: 'Rock' }],
      },
      stats: {
        ratedDiscCount: 2,
        averageRate: 8.25,
        highestRatedDisc: { id: 'disc-1', name: 'Best', rate: 9.5 },
        lowestRatedDisc: { id: 'disc-2', name: 'Worst', rate: 7 },
        firstAvailableActivityAt: '2020-01-01T00:00:00.000000',
        lastAvailableActivityAt: '2024-02-03T04:05:06.000000',
      },
      discs: {
        data: [
          {
            id: 'disc-2',
            name: 'Worst',
            image: null,
            releaseDate: null,
            rate: 7,
            cover: null,
            rateId: 'rate-2',
            lastActivityAt: '2024-02-03T04:05:06.000000',
          },
        ],
        total: 2,
        page: 1,
        limit: 1,
        totalPages: 2,
      },
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual(['session-user', 'artist-1']);
    expect(query.mock.calls[1][1]).toEqual(['session-user', 'artist-1', 1, 0]);
  });

  it('returns null statistics and an empty page for an existing artist without musical ratings', async () => {
    const { service } = createService([[artistRow()], []]);

    await expect(
      service.getArtistSummary(
        'session-user',
        'artist-1',
        new RatesArtistSummaryQueryDto(),
      ),
    ).resolves.toMatchObject({
      artist: {
        id: 'artist-1',
        image: null,
        country: null,
        genres: [],
      },
      stats: {
        ratedDiscCount: 0,
        averageRate: null,
        highestRatedDisc: null,
        lowestRatedDisc: null,
        firstAvailableActivityAt: null,
        lastAvailableActivityAt: null,
      },
      discs: { data: [], total: 0, page: 1, limit: 10, totalPages: 0 },
    });
  });

  it('returns 404 without querying Rates when the artist does not exist', async () => {
    const { service, query } = createService([[], []]);

    await expect(
      service.getArtistSummary(
        'session-user',
        'missing-artist',
        new RatesArtistSummaryQueryDto(),
      ),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Artist with id missing-artist not found',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('deduplicates before statistics and pagination and orders the page in PostgreSQL', async () => {
    const { service, query } = createService([[artistRow()], []]);
    await service.getArtistSummary(
      'session-user',
      'artist-1',
      Object.assign(new RatesArtistSummaryQueryDto(), { page: 3, limit: 5 }),
    );

    const [summarySql, summaryParams] = query.mock.calls[0];
    const [pageSql, pageParams] = query.mock.calls[1];
    for (const sql of [summarySql, pageSql]) {
      expect(sql).toContain('rate."userId" = $1');
      expect(sql).toContain('disc."artistId" = $2');
      expect(sql).toContain('rate.rate IS NOT NULL');
      expect(sql).toContain('PARTITION BY rate."discId"');
      expect(sql).toContain('rate.id DESC');
      expect(sql).toContain('duplicate_position = 1');
      expect(sql).not.toContain('rate_vote_events');
      expect(sql.trimStart()).toMatch(/^WITH/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
    expect(summarySql).toContain(
      'COUNT(DISTINCT "discId")::int AS "ratedDiscCount"',
    );
    expect(summarySql).toContain('AVG("rateValue") AS "averageRate"');
    expect(summarySql).toContain('MIN("createdAt")');
    expect(summarySql).toContain('MAX("lastActivityAt")');
    expect(summarySql).toContain('ORDER BY "rateValue" DESC, "discId" ASC');
    expect(summarySql).toContain('ORDER BY "rateValue" ASC, "discId" ASC');
    expect(summarySql).toContain('SELECT DISTINCT genre.id, genre.name');
    expect(summarySql).not.toContain('LIMIT $3');
    expect(pageSql).toContain('ORDER BY "lastActivityAt" DESC, "discId" ASC');
    expect(pageSql).toContain('LIMIT $3');
    expect(pageSql).toContain('OFFSET $4');
    expect(pageSql).not.toContain('country');
    expect(summaryParams).toEqual(['session-user', 'artist-1']);
    expect(pageParams).toEqual(['session-user', 'artist-1', 5, 10]);
  });

  it('keeps the DTO average as the real personal mean rather than any derived score', async () => {
    const { service } = createService([
      [artistRow({ averageRate: '8.5' })],
      [],
    ]);
    const result = await service.getArtistSummary(
      'session-user',
      'artist-1',
      new RatesArtistSummaryQueryDto(),
    );

    expect(result.stats.averageRate).toBe(8.5);
    expect(result.stats).not.toHaveProperty('score');
    expect(result.stats).not.toHaveProperty('bayesianScore');
  });
});
