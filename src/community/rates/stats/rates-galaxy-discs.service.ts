import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import { RatesStatsRatedDiscDto } from '../dto/rates-user-stats.dto';
import { getCurrentScorePopulationQuery } from './helpers/current-score-population-query';

interface GalaxyDiscRow {
  id: string;
  name: string;
  rate: string | number;
  artistId: string | null;
  artistName: string | null;
  genreId: string | null;
  genreName: string | null;
  genreColor: string | null;
}

@Injectable()
export class RatesGalaxyDiscsService {
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
  ): Promise<RatesStatsRatedDiscDto[]> {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new BadRequestException('A user is required for galaxy discs.');
    }
    if (timeZone !== undefined && !isValidTimeZone(timeZone)) {
      throw new BadRequestException('timeZone must be a valid IANA time zone.');
    }

    const population = getCurrentScorePopulationQuery(userId, year, timeZone);
    const repository =
      population.repository === 'rate'
        ? this.rateRepository
        : this.eventRepository;
    const rows = await repository.query<GalaxyDiscRow[]>(
      `WITH ${population.ctes}
      SELECT disc.id, disc.name,
        current_scores."currentRate" AS rate,
        artist.id AS "artistId", artist.name AS "artistName",
        genre.id AS "genreId", genre.name AS "genreName",
        genre.color AS "genreColor"
      FROM current_scores
      INNER JOIN disc ON disc.id = current_scores."discId"
      LEFT JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE current_scores."currentRate" IS NOT NULL
        AND current_scores."currentRate" >= 0
        AND current_scores."currentRate" <= 10
      ORDER BY current_scores."currentRate" DESC,
        disc.name ASC, disc.id ASC`,
      population.parameters,
    );

    return rows.map(mapGalaxyDisc);
  }
}

function mapGalaxyDisc(row: GalaxyDiscRow): RatesStatsRatedDiscDto {
  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 10) {
    throw new Error('Galaxy disc score must be a valid Rate score.');
  }
  if ((row.artistId === null) !== (row.artistName === null)) {
    throw new Error('Galaxy disc artist identity and name must be consistent.');
  }
  if (row.genreId === null && row.genreName !== null) {
    throw new Error('Galaxy disc genre name requires a genre identity.');
  }

  return {
    id: row.id,
    name: row.name,
    rate,
    artist:
      row.artistId === null
        ? null
        : { name: requireValue(row.artistName, 'artist name') },
    genre:
      row.genreId === null
        ? null
        : {
            name: requireValue(row.genreName, 'genre name'),
            color: row.genreColor,
          },
  };
}

function requireValue(value: string | null, label: string): string {
  if (value === null) {
    throw new Error(
      `Galaxy disc ${label} must be present when its relation exists.`,
    );
  }
  return value;
}

function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}
