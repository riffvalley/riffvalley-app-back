import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import { getCurrentScorePopulationQuery } from './helpers/current-score-population-query';

/** Current controversial-disc result with the approved minimum of four other voters. */
export interface RatesControversyCandidate {
  id: string;
  name: string;
  image: string | null;
  userRate: number;
  communityAverage: number;
  diff: number;
  communityRateCount: number;
  artist: { name: string } | null;
  genre: { name: string; color: string | null } | null;
}

interface ControversyRow {
  id: string;
  name: string;
  image: string | null;
  userRate: string | number;
  communityAverage: string | number;
  communityRateCount: string | number;
  artistName: string | null;
  genreName: string | null;
  genreColor: string | null;
}

@Injectable()
export class RatesControversialDiscsService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async analyzeForUser(
    userId: string,
    year: number,
    timeZone?: string,
  ): Promise<RatesControversyCandidate[]> {
    const population = getCurrentScorePopulationQuery(userId, year, timeZone);
    const repository =
      population.repository === 'rate'
        ? this.rateRepository
        : this.eventRepository;
    const requesterParameter = `$${population.parameters.length + 1}`;
    const rows = await repository.query<ControversyRow[]>(
      `WITH ${population.ctes}, eligible_personal_scores AS (
        SELECT "discId", "currentRate" AS "userRate"
        FROM current_scores
        WHERE "currentRate" IS NOT NULL
          AND "currentRate" >= 0 AND "currentRate" <= 10
      ), ranked_community_rates AS (
        SELECT community_rate."discId", community_rate."userId",
          community_rate.rate AS "communityRate",
          ROW_NUMBER() OVER (
            PARTITION BY community_rate."discId", community_rate."userId"
            ORDER BY community_rate."editedAt" DESC NULLS LAST,
              community_rate."createdAt" DESC, community_rate.id DESC
          ) AS current_position
        FROM eligible_personal_scores
        INNER JOIN rate community_rate
          ON community_rate."discId" = eligible_personal_scores."discId"
        WHERE community_rate."userId" <> ${requesterParameter}
      ), valid_community_rates AS (
        SELECT "discId", "userId", "communityRate"
        FROM ranked_community_rates
        WHERE current_position = 1
          AND "communityRate" IS NOT NULL
          AND "communityRate" >= 0 AND "communityRate" <= 10
      ), community_averages AS (
        SELECT eligible_personal_scores."discId",
          (SUM(valid_community_rates."communityRate") +
            eligible_personal_scores."userRate") /
            (COUNT(*) + 1) AS "communityAverage",
          (COUNT(*) + 1)::int AS "communityRateCount"
        FROM eligible_personal_scores
        INNER JOIN valid_community_rates
          ON valid_community_rates."discId" = eligible_personal_scores."discId"
        GROUP BY eligible_personal_scores."discId",
          eligible_personal_scores."userRate"
        HAVING COUNT(*) >= 4
      )
      SELECT disc.id, disc.name, disc.image,
        eligible_personal_scores."userRate" AS "userRate",
        community_averages."communityAverage" AS "communityAverage",
        community_averages."communityRateCount" AS "communityRateCount",
        artist.name AS "artistName", genre.name AS "genreName",
        genre.color AS "genreColor"
      FROM eligible_personal_scores
      INNER JOIN community_averages
        ON community_averages."discId" = eligible_personal_scores."discId"
      INNER JOIN disc ON disc.id = eligible_personal_scores."discId"
      LEFT JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      ORDER BY ABS(eligible_personal_scores."userRate" -
          community_averages."communityAverage") DESC,
        community_averages."communityRateCount" DESC, disc.id ASC
      LIMIT 5`,
      [...population.parameters, userId],
    );
    return rows.map(mapControversyCandidate);
  }
}

function mapControversyCandidate(
  row: ControversyRow,
): RatesControversyCandidate {
  const userRate = toValidScore(row.userRate, 'personal');
  const communityAverage = toValidScore(row.communityAverage, 'community');
  const communityRateCount = Number(row.communityRateCount);
  if (!Number.isSafeInteger(communityRateCount) || communityRateCount < 1) {
    throw new Error('Community Rate count must be a positive integer.');
  }
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    userRate,
    communityAverage,
    diff: userRate - communityAverage,
    communityRateCount,
    artist: row.artistName === null ? null : { name: row.artistName },
    genre:
      row.genreName === null
        ? null
        : { name: row.genreName, color: row.genreColor },
  };
}

function toValidScore(value: string | number, label: string): number {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error(`The ${label} score must be a valid Rate score.`);
  }
  return score;
}
