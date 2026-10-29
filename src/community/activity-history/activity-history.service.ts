import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { buildMusicNameMultiColumnPartialPredicate } from '../../catalog/shared/music-name/music-name-search';
import { RateVoteEvent } from '../rates/entities/rate-vote-event.entity';
import {
  ActivityHistoryFilters,
  ActivityHistoryItem,
  ActivityHistoryPage,
  ActivityHistoryPosition,
} from './types/activity-history.types';
import { resolveLocalDateRange } from './helpers/local-date-range';
import { createLocalDateResolver } from './helpers/local-date';

interface ActivityHistoryRawRow {
  event_id: string;
  event_type: 'set' | 'change';
  occurred_at: string;
  previous_value: string | number | null;
  new_value: string | number | null;
  disc_id: string;
  disc_name: string | null;
  disc_image: string | null;
  artist_id: string | null;
  artist_name: string | null;
  genre_id: string | null;
  genre_name: string | null;
}

interface DailySetCountRawRow {
  local_date: string;
  set_count: string | number;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

@Injectable()
export class ActivityHistoryService {
  constructor(
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async findUserHistory(
    userId: string,
    filters: ActivityHistoryFilters = {},
  ): Promise<ActivityHistoryPage> {
    const limit = this.normalizeLimit(filters.limit);
    const range = resolveLocalDateRange(
      filters.from,
      filters.to,
      filters.timeZone,
    );
    const query = this.createProjectionQuery(userId, filters, range, limit);
    const rows = await query.getRawMany<ActivityHistoryRawRow>();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapActivityHistoryRow);
    const timeZone = filters.timeZone ?? 'UTC';
    const localDateFor = createLocalDateResolver(timeZone);
    const localDates = [
      ...new Set(items.map((item) => localDateFor(item.occurredAt))),
    ];
    const dailySetCounts = localDates.length
      ? await this.findDailySetCounts(userId, timeZone, localDates)
      : {};
    const lastItem = items.at(-1);

    const nextPosition =
      hasMore && lastItem
        ? {
            after: { occurredAt: lastItem.occurredAt, id: lastItem.id },
            anchor: filters.continuation?.anchor ?? positionFromRawRow(rows[0]),
          }
        : null;

    return { items, hasMore, nextPosition, dailySetCounts };
  }

  private async findDailySetCounts(
    userId: string,
    timeZone: string,
    localDates: string[],
  ): Promise<Record<string, number>> {
    const sortedDates = [...localDates].sort();
    const bounds = resolveLocalDateRange(
      sortedDates[0],
      sortedDates.at(-1),
      timeZone,
    );
    if (!bounds.fromInstant || !bounds.toExclusiveInstant) {
      throw new Error('Daily set count dates require a complete local range.');
    }
    const rows: DailySetCountRawRow[] = await this.eventRepository.query(
      `SELECT to_char((occurred_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS local_date,
              COUNT(*) AS set_count
       FROM rate_vote_events
       WHERE user_id = $1
         AND event_type = 'set'
         AND occurred_at >= $3
         AND occurred_at < $4
         AND (occurred_at AT TIME ZONE $2)::date = ANY($5::date[])
       GROUP BY (occurred_at AT TIME ZONE $2)::date`,
      [
        userId,
        timeZone,
        bounds.fromInstant,
        bounds.toExclusiveInstant,
        sortedDates,
      ],
    );
    const counts = new Map(
      rows.map((row) => [row.local_date, Number(row.set_count)]),
    );
    return Object.fromEntries(
      localDates.map((date) => [date, counts.get(date) ?? 0]),
    );
  }

  private createProjectionQuery(
    userId: string,
    filters: ActivityHistoryFilters,
    range: ReturnType<typeof resolveLocalDateRange>,
    limit: number,
  ): SelectQueryBuilder<RateVoteEvent> {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .innerJoin('disc', 'disc', 'disc.id = event.disc_id')
      .leftJoin('artist', 'artist', 'artist.id = disc."artistId"')
      .leftJoin('genre', 'genre', 'genre.id = disc."genreId"')
      .select('event.id', 'event_id')
      .addSelect('event.eventType', 'event_type')
      .addSelect(
        `to_char(event.occurredAt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'occurred_at',
      )
      .addSelect('event.previousValue', 'previous_value')
      .addSelect('event.newValue', 'new_value')
      .addSelect('disc.id', 'disc_id')
      .addSelect('disc.name', 'disc_name')
      .addSelect('disc.image', 'disc_image')
      .addSelect('artist.id', 'artist_id')
      .addSelect('artist.name', 'artist_name')
      .addSelect('genre.id', 'genre_id')
      .addSelect('genre.name', 'genre_name')
      .where('event.userId = :userId', { userId })
      .andWhere("event.eventType IN ('set', 'change')")
      .orderBy('event.occurredAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .limit(limit + 1);

    if (filters.type) {
      query.andWhere('event.eventType = :eventType', {
        eventType: filters.type,
      });
    }
    if (range.fromInstant) {
      query.andWhere('event.occurredAt >= :fromInstant', {
        fromInstant: range.fromInstant,
      });
    }
    if (range.toExclusiveInstant) {
      query.andWhere('event.occurredAt < :toExclusiveInstant', {
        toExclusiveInstant: range.toExclusiveInstant,
      });
    }
    if (filters.query !== undefined) {
      const search = buildMusicNameMultiColumnPartialPredicate(
        filters.query,
        [
          {
            normalizedColumn: 'disc.search_name_normalized',
            legacyColumn: 'disc.name',
            legacyValue: filters.query,
            legacyOperator: 'ILIKE',
          },
          {
            normalizedColumn: 'artist.search_name_normalized',
            legacyColumn: 'artist.name',
            legacyValue: filters.query,
            legacyOperator: 'ILIKE',
          },
        ],
        'activitySearch',
      );
      query.andWhere(search.predicate, search.parameters);
    }
    if (filters.continuation) {
      query.andWhere(
        '(event.occurredAt, event.id) < (:afterOccurredAt, :afterId)',
        {
          afterOccurredAt: filters.continuation.after.occurredAt,
          afterId: filters.continuation.after.id,
        },
      );
      query.andWhere(
        '(event.occurredAt, event.id) <= (:anchorOccurredAt, :anchorId)',
        {
          anchorOccurredAt: filters.continuation.anchor.occurredAt,
          anchorId: filters.continuation.anchor.id,
        },
      );
    }
    return query;
  }

  private normalizeLimit(limit: number | undefined): number {
    const normalized = limit ?? DEFAULT_LIMIT;
    if (
      !Number.isInteger(normalized) ||
      normalized < 1 ||
      normalized > MAX_LIMIT
    ) {
      throw new Error(`Limit must be an integer from 1 to ${MAX_LIMIT}.`);
    }
    return normalized;
  }
}

function mapActivityHistoryRow(
  row: ActivityHistoryRawRow,
): ActivityHistoryItem {
  return {
    id: row.event_id,
    type: row.event_type,
    occurredAt: row.occurred_at,
    previousValue: toNullableNumber(row.previous_value),
    newValue: toNullableNumber(row.new_value),
    disc: {
      id: row.disc_id,
      title: row.disc_name,
      artist:
        row.artist_id && row.artist_name !== null
          ? { id: row.artist_id, name: row.artist_name }
          : null,
      coverUrl: row.disc_image,
      genre:
        row.genre_id && row.genre_name !== null
          ? { id: row.genre_id, name: row.genre_name }
          : null,
    },
  };
}

function toNullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function positionFromRawRow(
  row: ActivityHistoryRawRow,
): ActivityHistoryPosition {
  return { occurredAt: row.occurred_at, id: row.event_id };
}
