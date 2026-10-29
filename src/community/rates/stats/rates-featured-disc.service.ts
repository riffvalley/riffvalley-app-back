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
