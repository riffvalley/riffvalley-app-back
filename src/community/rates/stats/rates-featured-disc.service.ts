import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import { RatesStatsDiscDto } from '../dto/rates-user-stats.dto';
import { getCurrentScorePopulationQuery } from './helpers/current-score-population-query';

interface FeaturedDiscRow {
  id: string;
  name: string;
  image: string | null;
  rate: string | number;
  artistName: string | null;
  genreName: string | null;
  genreColor: string | null;
}

interface GroupFeaturedDiscRow extends FeaturedDiscRow {
  groupValue: string | null;
  groupType: 'overall' | 'month' | 'genre';
}

export interface RatesGroupFeaturedDiscs {
  byMonth: Array<{ month: string; topDisc: RatesStatsDiscDto }>;
  byGenre: Array<{ genre: string; topDisc: RatesStatsDiscDto }>;
}

export interface RatesAnnualHighlights extends RatesGroupFeaturedDiscs {
  topDiscOverall: RatesStatsDiscDto | null;
}

@Injectable()
export class RatesFeaturedDiscService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async selectForUser(
    userId: string,
    year: number,
    timeZone?: string,
  ): Promise<RatesStatsDiscDto | null> {
    const population = getCurrentScorePopulationQuery(userId, year, timeZone);
    const repository =
      population.repository === 'rate'
        ? this.rateRepository
        : this.eventRepository;
    const rows = await repository.query<FeaturedDiscRow[]>(
      `WITH ${population.ctes}
      SELECT disc.id, disc.name, disc.image, current_scores."currentRate" AS rate,
        artist.name AS "artistName", genre.name AS "genreName",
        genre.color AS "genreColor"
      FROM current_scores
      INNER JOIN disc ON disc.id = current_scores."discId"
      LEFT JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE current_scores."currentRate" IS NOT NULL
        AND current_scores."currentRate" >= 0
        AND current_scores."currentRate" <= 10
      ORDER BY current_scores."currentRate" DESC,
        current_scores."eligibleAt" DESC, disc.id ASC
      LIMIT 1`,
      population.parameters,
    );
    const row = rows[0];
    return row ? mapFeaturedDisc(row) : null;
  }

  async selectGroupHighlightsForUser(
    userId: string,
    year: number,
    timeZone?: string,
  ): Promise<RatesGroupFeaturedDiscs> {
    const highlights = await this.selectAnnualHighlightsForUser(
      userId,
      year,
      timeZone,
    );
    return { byMonth: highlights.byMonth, byGenre: highlights.byGenre };
  }

  async selectAnnualHighlightsForUser(
    userId: string,
    year: number,
    timeZone?: string,
  ): Promise<RatesAnnualHighlights> {
    const population = getCurrentScorePopulationQuery(userId, year, timeZone);
    const repository =
      population.repository === 'rate'
        ? this.rateRepository
        : this.eventRepository;
    const rows = await repository.query<GroupFeaturedDiscRow[]>(
      population.repository === 'rate'
        ? historicalGroupHighlightsSql(population.ctes)
        : eventGroupHighlightsSql(population.ctes),
      population.repository === 'rate'
        ? population.parameters
        : [...population.parameters, timeZone ?? 'UTC'],
    );
    const overall = rows.find((row) => row.groupType === 'overall');
    return {
      topDiscOverall: overall ? mapFeaturedDisc(overall) : null,
      byMonth: rows
        .filter(
          (row): row is GroupFeaturedDiscRow & { groupValue: string } =>
            row.groupType === 'month' && row.groupValue !== null,
        )
        .map((row) => ({ month: row.groupValue, topDisc: mapFeaturedDisc(row) })),
      byGenre: rows
        .filter(
          (row): row is GroupFeaturedDiscRow & { groupValue: string } =>
            row.groupType === 'genre' && row.groupValue !== null,
        )
        .map((row) => ({ genre: row.groupValue, topDisc: mapFeaturedDisc(row) })),
    };
  }
}

function historicalGroupHighlightsSql(ctes: string): string {
  return `WITH ${ctes}, ranked_overall AS (
    SELECT current_scores."currentRate" AS rate,
      current_scores."eligibleAt" AS eligible_at,
      disc.id, disc.name, disc.image,
      artist.name AS artist_name, genre.name AS genre_name,
      genre.color AS genre_color,
      ROW_NUMBER() OVER (
        ORDER BY current_scores."currentRate" DESC,
          current_scores."eligibleAt" DESC, disc.id ASC
      ) AS position
    FROM current_scores
    INNER JOIN disc ON disc.id = current_scores."discId"
    LEFT JOIN artist ON artist.id = disc."artistId"
    LEFT JOIN genre ON genre.id = disc."genreId"
    WHERE current_scores."currentRate" BETWEEN 0 AND 10
  ), ranked_months AS (
    SELECT TO_CHAR(eligible_rate_rows."createdAtLocal", 'YYYY-MM') AS group_value,
      current_scores."currentRate" AS rate,
      eligible_rate_rows."createdAtLocal" AS eligible_at,
      disc.id, disc.name, disc.image,
      artist.name AS artist_name, genre.name AS genre_name,
      genre.color AS genre_color,
      ROW_NUMBER() OVER (
        PARTITION BY TO_CHAR(eligible_rate_rows."createdAtLocal", 'YYYY-MM')
        ORDER BY current_scores."currentRate" DESC,
          eligible_rate_rows."createdAtLocal" DESC, disc.id ASC
      ) AS position
    FROM eligible_rate_rows
    INNER JOIN current_scores ON current_scores."discId" = eligible_rate_rows."discId"
    INNER JOIN disc ON disc.id = eligible_rate_rows."discId"
    LEFT JOIN artist ON artist.id = disc."artistId"
    LEFT JOIN genre ON genre.id = disc."genreId"
    WHERE current_scores."currentRate" BETWEEN 0 AND 10
  ), ranked_genres AS (
    SELECT genre.name AS group_value,
      current_scores."currentRate" AS rate,
      current_scores."eligibleAt" AS eligible_at,
      disc.id, disc.name, disc.image,
      artist.name AS artist_name, genre.name AS genre_name,
      genre.color AS genre_color,
      ROW_NUMBER() OVER (
        PARTITION BY genre.name
        ORDER BY current_scores."currentRate" DESC,
          current_scores."eligibleAt" DESC, disc.id ASC
      ) AS position
    FROM current_scores
    INNER JOIN disc ON disc.id = current_scores."discId"
    INNER JOIN genre ON genre.id = disc."genreId"
    LEFT JOIN artist ON artist.id = disc."artistId"
    WHERE current_scores."currentRate" BETWEEN 0 AND 10
  )
  SELECT 'overall'::text AS "groupType", NULL::text AS "groupValue",
    id, name, image, rate, artist_name AS "artistName",
    genre_name AS "genreName", genre_color AS "genreColor"
  FROM ranked_overall WHERE position = 1
  UNION ALL
  SELECT 'month'::text AS "groupType", group_value AS "groupValue",
    id, name, image, rate, artist_name AS "artistName",
    genre_name AS "genreName", genre_color AS "genreColor"
  FROM ranked_months WHERE position = 1
  UNION ALL
  SELECT 'genre'::text AS "groupType", group_value AS "groupValue",
    id, name, image, rate, artist_name AS "artistName",
    genre_name AS "genreName", genre_color AS "genreColor"
  FROM ranked_genres WHERE position = 1
  ORDER BY "groupType", "groupValue"`;
}

function eventGroupHighlightsSql(ctes: string): string {
  return `WITH ${ctes}, ranked_overall AS (
    SELECT current_scores."currentRate" AS rate,
      current_scores."eligibleAt" AS eligible_at,
      disc.id, disc.name, disc.image,
      artist.name AS artist_name, genre.name AS genre_name,
      genre.color AS genre_color,
      ROW_NUMBER() OVER (
        ORDER BY current_scores."currentRate" DESC,
          current_scores."eligibleAt" DESC, disc.id ASC
      ) AS position
    FROM current_scores
    INNER JOIN disc ON disc.id = current_scores."discId"
    LEFT JOIN artist ON artist.id = disc."artistId"
    LEFT JOIN genre ON genre.id = disc."genreId"
    WHERE current_scores."currentRate" BETWEEN 0 AND 10
  ), ranked_months AS (
    SELECT TO_CHAR(event."occurredAt" AT TIME ZONE $7, 'YYYY-MM') AS group_value,
      current_scores."currentRate" AS rate,
      event."occurredAt" AS eligible_at,
      disc.id, disc.name, disc.image,
      artist.name AS artist_name, genre.name AS genre_name,
      genre.color AS genre_color,
      ROW_NUMBER() OVER (
        PARTITION BY TO_CHAR(event."occurredAt" AT TIME ZONE $7, 'YYYY-MM')
        ORDER BY current_scores."currentRate" DESC,
          event."occurredAt" DESC, disc.id ASC
      ) AS position
    FROM eligible_set_events event
    INNER JOIN current_scores ON current_scores."discId" = event."discId"
    INNER JOIN disc ON disc.id = event."discId"
    LEFT JOIN artist ON artist.id = disc."artistId"
    LEFT JOIN genre ON genre.id = disc."genreId"
    WHERE current_scores."currentRate" BETWEEN 0 AND 10
  ), ranked_genres AS (
    SELECT genre.name AS group_value,
      current_scores."currentRate" AS rate,
      current_scores."eligibleAt" AS eligible_at,
      disc.id, disc.name, disc.image,
      artist.name AS artist_name, genre.name AS genre_name,
      genre.color AS genre_color,
      ROW_NUMBER() OVER (
        PARTITION BY genre.name
        ORDER BY current_scores."currentRate" DESC,
          current_scores."eligibleAt" DESC, disc.id ASC
      ) AS position
    FROM current_scores
    INNER JOIN disc ON disc.id = current_scores."discId"
    INNER JOIN genre ON genre.id = disc."genreId"
    LEFT JOIN artist ON artist.id = disc."artistId"
    WHERE current_scores."currentRate" BETWEEN 0 AND 10
  )
  SELECT 'overall'::text AS "groupType", NULL::text AS "groupValue",
    id, name, image, rate, artist_name AS "artistName",
    genre_name AS "genreName", genre_color AS "genreColor"
  FROM ranked_overall WHERE position = 1
  UNION ALL
  SELECT 'month'::text AS "groupType", group_value AS "groupValue",
    id, name, image, rate, artist_name AS "artistName",
    genre_name AS "genreName", genre_color AS "genreColor"
  FROM ranked_months WHERE position = 1
  UNION ALL
  SELECT 'genre'::text AS "groupType", group_value AS "groupValue",
    id, name, image, rate, artist_name AS "artistName",
    genre_name AS "genreName", genre_color AS "genreColor"
  FROM ranked_genres WHERE position = 1
  ORDER BY "groupType", "groupValue"`;
}

function mapFeaturedDisc(row: FeaturedDiscRow): RatesStatsDiscDto {
  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 10) {
    throw new Error('Featured disc score must be a valid Rate score.');
  }
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    rate,
    artist: row.artistName === null ? null : { name: row.artistName },
    genre:
      row.genreName === null
        ? null
        : { name: row.genreName, color: row.genreColor },
  };
}
