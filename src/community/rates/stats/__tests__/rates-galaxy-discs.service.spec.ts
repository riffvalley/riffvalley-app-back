import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesGalaxyDiscsService } from '../rates-galaxy-discs.service';

interface GalaxyRow {
  id: string;
  name: string;
  rate: number | string;
  artistId: string | null;
  artistName: string | null;
  genreId: string | null;
  genreName: string | null;
  genreColor: string | null;
}

function createService(rows: GalaxyRow[] = []): {
  service: RatesGalaxyDiscsService;
  rateQuery: jest.Mock<Promise<GalaxyRow[]>, [string, unknown[]?]>;
  eventQuery: jest.Mock<Promise<GalaxyRow[]>, [string, unknown[]?]>;
} {
  const manager = new EntityManager(
    new DataSource({ type: 'postgres', database: 'rates-galaxy-discs' }),
  );
  const rateRepository = new Repository<Rate>(Rate, manager);
  const eventRepository = new Repository<RateVoteEvent>(RateVoteEvent, manager);
  const rateQuery = jest
    .fn<Promise<GalaxyRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  const eventQuery = jest
    .fn<Promise<GalaxyRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  Object.assign(rateRepository, { query: rateQuery });
  Object.assign(eventRepository, { query: eventQuery });
  return {
    service: new RatesGalaxyDiscsService(rateRepository, eventRepository),
    rateQuery,
    eventQuery,
  };
}

const artistId = 'artist-id';
const genreId = 'genre-id';
const galaxyRow: GalaxyRow = {
  id: 'disc-id',
  name: 'Example record',
  rate: '9.25',
  artistId,
  artistName: 'Example artist',
  genreId,
  genreName: 'Example genre',
  genreColor: '#123456',
};

describe('RatesGalaxyDiscsService', () => {
  it.each([
    { year: 2025, source: 'rate' },
    { year: 2026, source: 'rate' },
    { year: 2027, source: 'event' },
  ])(
    'uses the shared eligible population for $year',
    async ({ year, source }) => {
      const { service, rateQuery, eventQuery } = createService([galaxyRow]);

      await service.selectForUser('user-id', year, 'Europe/Madrid');

      expect(source === 'rate' ? rateQuery : eventQuery).toHaveBeenCalledTimes(
        1,
      );
      expect(source === 'rate' ? eventQuery : rateQuery).not.toHaveBeenCalled();
    },
  );

  it('returns the contracted catalogue projection and deterministically orders scores, titles, and IDs', async () => {
    const { service, rateQuery } = createService([galaxyRow]);

    await expect(service.selectForUser('user-id', 2026)).resolves.toEqual([
      {
        id: 'disc-id',
        name: 'Example record',
        rate: 9.25,
        artist: { name: 'Example artist' },
        genre: { name: 'Example genre', color: '#123456' },
      },
    ]);
    const sql = rateQuery.mock.calls[0][0];
    expect(sql).toContain('WITH eligible_rate_rows AS');
    expect(sql).toContain('WHERE current_position = 1');
    expect(sql).toContain(
      'ORDER BY "editedAt" DESC NULLS LAST, "createdAt" DESC, "rateId" DESC',
    );
    expect(sql).toContain('LEFT JOIN artist ON artist.id = disc."artistId"');
    expect(sql).toContain('LEFT JOIN genre ON genre.id = disc."genreId"');
    expect(sql).toContain(
      'ORDER BY current_scores."currentRate" DESC,\n        disc.name ASC, disc.id ASC',
    );
    expect(sql).toContain('disc."releaseDate" >= $2::date');
    expect(sql).toContain('WHERE rate."userId" = $1');
    expect(sql).not.toContain('LIMIT');
  });

  it('keeps eligible discs when optional artist and genre metadata are absent', async () => {
    const { service } = createService([
      {
        ...galaxyRow,
        artistId: null,
        artistName: null,
        genreId: null,
        genreName: null,
        genreColor: null,
      },
    ]);

    await expect(service.selectForUser('user-id', 2025)).resolves.toEqual([
      {
        id: 'disc-id',
        name: 'Example record',
        rate: 9.25,
        artist: null,
        genre: null,
      },
    ]);
  });

  it('returns an empty collection without substituting other data', async () => {
    const { service } = createService();
    await expect(
      service.selectForUser('user-id', 2027, 'UTC'),
    ).resolves.toEqual([]);
  });

  it.each(['11.00', '-0.01', 'NaN'])(
    'fails on an invalid returned score (%s)',
    async (rate) => {
      const { service } = createService([{ ...galaxyRow, rate }]);
      await expect(service.selectForUser('user-id', 2026)).rejects.toThrow(
        'Galaxy disc score must be a valid Rate score.',
      );
    },
  );

  it('propagates query failures instead of returning an empty collection', async () => {
    const { service, rateQuery } = createService();
    const databaseError = new Error('query failed');
    rateQuery.mockRejectedValue(databaseError);

    await expect(service.selectForUser('user-id', 2025)).rejects.toBe(
      databaseError,
    );
  });

  it('requires a user and validates a supplied IANA time zone', async () => {
    const { service, rateQuery, eventQuery } = createService();
    await expect(service.selectForUser(' ', 2025)).rejects.toThrow(
      'A user is required for galaxy discs.',
    );
    await expect(
      service.selectForUser('user-id', 2026, 'Invalid/Zone'),
    ).rejects.toThrow('timeZone must be a valid IANA time zone.');
    expect(rateQuery).not.toHaveBeenCalled();
    expect(eventQuery).not.toHaveBeenCalled();
  });

  it('uses the shared modern population to deduplicate events and rank the current Rate before validation', async () => {
    const { service, eventQuery } = createService();

    await service.selectForUser('user-id', 2027, 'Europe/Madrid');
    const [sql, parameters] = eventQuery.mock.calls[0];
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('GROUP BY "discId"');
    expect(sql).toContain('WHERE current_position = 1');
    expect(sql).toContain(
      'ORDER BY rate."editedAt" DESC NULLS LAST, rate."createdAt" DESC, rate.id DESC',
    );
    expect(sql).toContain('current_scores."currentRate" >= 0');
    expect(sql).not.toContain('event.new_value AS rate');
    expect(parameters).toEqual([
      'user-id',
      '2027-01-01',
      '2028-01-01',
      expect.any(Date),
      expect.any(Date),
      'user-id',
    ]);
  });
});
