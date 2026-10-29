import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesEventSetCohortService } from '../rates-event-set-cohort.service';

interface EventRow {
  eventId: string;
  occurredAt: Date | string;
  discId: string;
  releaseDate: string;
}

function createService(rows: EventRow[] = []) {
  const repository = new Repository<RateVoteEvent>(
    RateVoteEvent,
    new EntityManager(
      new DataSource({ type: 'postgres', database: 'rates-event-set-cohort' }),
    ),
  );
  const query = jest
    .fn<Promise<EventRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  Object.assign(repository, { query });
  return { service: new RatesEventSetCohortService(repository), query };
}

describe('RatesEventSetCohortService', () => {
  it("selects only the user's set transition for same-year releases and preserves event identities", async () => {
    const rows: EventRow[] = [
      {
        eventId: 'event-1',
        occurredAt: '2027-05-01T10:00:00.000Z',
        discId: 'disc-a',
        releaseDate: '2027-04-01',
      },
      {
        eventId: 'event-2',
        occurredAt: '2027-08-01T10:00:00.000Z',
        discId: 'disc-a',
        releaseDate: '2027-04-01',
      },
    ];
    const { service, query } = createService(rows);

    const result = await service.selectForUser({
      userId: 'authenticated-user-id',
      year: 2027,
      timeZone: 'UTC',
    });

    expect(result.events.map((event) => event.eventId)).toEqual([
      'event-1',
      'event-2',
    ]);
    expect(result.events[0].occurredAt).toBeInstanceOf(Date);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('INNER JOIN disc ON disc.id = event.disc_id');
    expect(sql).toContain('event.user_id = $1');
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('event.previous_value IS NULL');
    expect(sql).toContain('event.new_value IS NOT NULL');
    expect(sql).toContain('disc."releaseDate" >= $2::date');
    expect(sql).toContain('disc."releaseDate" < $3::date');
    expect(sql).toContain('event.occurred_at >= $4::timestamptz');
    expect(sql).toContain('event.occurred_at < $5::timestamptz');
    expect(sql).toContain('ORDER BY "occurredAt" ASC, "eventId" ASC');
    expect(parameters).toEqual([
      'authenticated-user-id',
      '2027-01-01',
      '2028-01-01',
      new Date('2027-01-01T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
    ]);
    expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it('defaults an omitted time zone to UTC', async () => {
    const { service } = createService();
    await expect(
      service.selectForUser({ userId: 'user-id', year: 2027 }),
    ).resolves.toMatchObject({ year: 2027, timeZone: 'UTC', events: [] });
  });

  it('uses a different IANA zone for local year boundaries', async () => {
    const { service, query } = createService();
    await service.selectForUser({
      userId: 'user-id',
      year: 2027,
      timeZone: 'Europe/Madrid',
    });
    expect(query.mock.calls[0][1]).toEqual([
      'user-id',
      '2027-01-01',
      '2028-01-01',
      new Date('2026-12-31T23:00:00.000Z'),
      new Date('2027-12-31T23:00:00.000Z'),
    ]);
  });

  it('rejects 2026 without querying', async () => {
    const { service, query } = createService();
    await expect(
      service.selectForUser({ userId: 'user-id', year: 2026 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { userId: '', year: 2027, timeZone: 'UTC' },
    { userId: 'user-id', year: 2027, timeZone: 'Invalid/Zone' },
  ])('rejects invalid cohort input before querying: %o', async (request) => {
    const { service, query } = createService();
    await expect(service.selectForUser(request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('returns an empty cohort when no events qualify', async () => {
    const { service } = createService();
    await expect(
      service.selectForUser({ userId: 'user-id', year: 2027 }),
    ).resolves.toMatchObject({ events: [] });
  });
});
