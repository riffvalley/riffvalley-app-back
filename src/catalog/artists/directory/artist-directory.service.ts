import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeForSearch } from '../helpers/normalize-for-search';
import { Artist } from '../entities/artist.entity';
import {
  escapeLikeLiteral,
  getMusicNameContainsPatterns,
} from '../../shared/music-name/music-name-search';

type DirectoryRow = {
  id: string;
  name: string;
  genre: string | null;
  genreColor: string | null;
};

type CountRow = { totalItems: number | string };

@Injectable()
export class ArtistDirectoryService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Pick<Repository<Artist>, 'query'>,
  ) {}

  async findDirectory(query: {
    letter?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const letter = query.letter ?? 'A';
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const parameters: Array<string | number | string[]> = [];
    const conditions: string[] = [];

    if (query.q?.trim()) {
      const patterns = getMusicNameContainsPatterns(query.q);
      const normalizedColumn = 'artist.search_name_normalized';
      const patternParameter = parameters.push(patterns);
      const legacyParameter = parameters.push(
        `%${escapeLikeLiteral(normalizeForSearch(query.q))}%`,
      );
      conditions.push(
        `(${normalizedColumn} LIKE ANY($${patternParameter}::text[]) OR (${normalizedColumn} IS NULL AND artist.name_normalized LIKE $${legacyParameter} ESCAPE '\\'))`,
      );
    } else {
      parameters.push(letter);
      const letterParameter = parameters.length;
      conditions.push(
        `CASE WHEN LEFT(BTRIM(artist.name), 1) !~ '^[[:alpha:]]$' THEN '#' WHEN COALESCE(artist.search_name_normalized, artist.name_normalized) ~ '^[a-z]' THEN UPPER(SUBSTRING(COALESCE(artist.search_name_normalized, artist.name_normalized) FROM 1 FOR 1)) ELSE '#' END = $${letterParameter}`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = (await this.artistRepository.query(
      `SELECT COUNT(*)::int AS "totalItems" FROM artist ${where}`,
      parameters,
    )) as CountRow[];
    const totalItems = Number(countRows[0]?.totalItems ?? 0);

    const pageParameters = [...parameters, limit, offset];
    const rows = (await this.artistRepository.query(
      `
      SELECT
        artist.id AS id,
        artist.name AS name,
        latest.genre_name AS genre,
        latest.genre_color AS "genreColor"
      FROM artist
      LEFT JOIN LATERAL (
        SELECT genre.name AS genre_name, genre.color AS genre_color
        FROM disc
        LEFT JOIN genre ON genre.id = disc."genreId"
        WHERE disc."artistId" = artist.id
        ORDER BY disc."releaseDate" DESC NULLS LAST, disc.id ASC
        LIMIT 1
      ) AS latest ON TRUE
      ${where}
      ORDER BY
        COALESCE(artist.search_name_normalized, artist.name_normalized) COLLATE "C" ASC,
        artist.name COLLATE "C" ASC,
        artist.id ASC
      LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
      `,
      pageParameters,
    )) as DirectoryRow[];

    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        genre: row.genre ?? null,
        genreColor: row.genreColor ?? null,
      })),
    };
  }
}
