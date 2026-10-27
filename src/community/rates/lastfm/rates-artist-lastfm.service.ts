import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sanitizeHtml = require('sanitize-html');
import { Repository } from 'typeorm';
import { ArtistCatalogService } from 'src/catalog/artists/catalog/artist-catalog.service';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { LastfmApiService } from 'src/integrations/lastfm-integration/lastfm-api.service';
import { LastfmArtistProfileLookup } from 'src/integrations/lastfm-integration/types/lastfm-api.types';
import { RatesArtistLastfmResponseDto } from '../dto/rates-artist-lastfm.dto';
import { ArtistCatalogNameMatch } from 'src/catalog/artists/catalog/artist-catalog.types';
import { RatesArtistLastfmCatalogDiscDto } from '../dto/rates-artist-lastfm.dto';

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};
const LASTFM_LIST_LIMIT = 5;
const BIOGRAPHY_MAX_LENGTH = 1_200;

type ArtistDiscCardRow = {
  id: string;
  name: string;
  image: string | null;
  releaseYear: number | string | null;
  releaseDate: string | null;
  link: string | null;
  ep: boolean;
  debut: boolean;
  genreName: string | null;
  genreColor: string | null;
  averageRate: number | string | null;
  averageCover: number | string | null;
  voteCount: number | string;
  commentCount: number | string;
  userRateId: string | null;
  userRate: number | string | null;
  userCover: number | string | null;
  favoriteId: string | null;
  pendingId: string | null;
};

type ArtistCatalogDiscCardMatch = Omit<
  ArtistCatalogNameMatch,
  'catalogDiscs'
> & {
  catalogDiscs: RatesArtistLastfmCatalogDiscDto[];
};

@Injectable()
export class RatesArtistLastfmService {
  constructor(
    @Inject(ArtistCatalogService)
    private readonly artistCatalogService: Pick<
      ArtistCatalogService,
      'findIdentityById' | 'findExactNameMatches'
    >,
    private readonly lastfmApiService: LastfmApiService,
    @InjectRepository(Disc)
    private readonly discRepository: Pick<Repository<Disc>, 'query'>,
  ) {}

  async getArtistInfo(
    artistId: string,
    userId: string,
  ): Promise<RatesArtistLastfmResponseDto> {
    const artist = await this.artistCatalogService.findIdentityById(artistId);
    if (!artist) {
      throw new NotFoundException(`Artist with id ${artistId} not found`);
    }

    const lookup = await this.lastfmApiService.lookupArtistProfile(artist.name);
    if (lookup.status !== 'found') {
      return emptyResponse(artist.id, lookup.status);
    }

    if (normalizeName(lookup.profile.name) !== normalizeName(artist.name)) {
      return emptyResponse(artist.id, 'not_found');
    }

    const similarArtists = uniqueLinks(lookup.profile.similarArtists);
    const catalogMatches = similarArtists.length
      ? await this.artistCatalogService.findExactNameMatches(
          similarArtists.map(({ name }) => name),
        )
      : [];
    const discCardMatches = await this.enrichCatalogDiscs(
      catalogMatches,
      userId,
    );

    return mapProfile(artist.id, lookup, similarArtists, discCardMatches);
  }

  private async enrichCatalogDiscs(
    matches: ArtistCatalogNameMatch[],
    userId: string,
  ): Promise<ArtistCatalogDiscCardMatch[]> {
    const discIds = [
      ...new Set(
        matches.flatMap(({ catalogDiscs }) => catalogDiscs.map(({ id }) => id)),
      ),
    ];
    if (!discIds.length) {
      return matches.map((match) => ({ ...match, catalogDiscs: [] }));
    }

    const rows = (await this.discRepository.query(
      `
      WITH requested_discs AS (
        SELECT unnest($1::uuid[]) AS id
      ),
      rate_stats AS (
        SELECT
          rate."discId" AS "discId",
          AVG(rate.rate) FILTER (WHERE rate.rate IS NOT NULL) AS "averageRate",
          AVG(rate.cover) FILTER (WHERE rate.cover IS NOT NULL) AS "averageCover",
          (COUNT(rate.id) FILTER (WHERE rate.rate IS NOT NULL))::int AS "voteCount"
        FROM rate
        INNER JOIN requested_discs ON requested_discs.id = rate."discId"
        GROUP BY rate."discId"
      ),
      comment_stats AS (
        SELECT comment."discId" AS "discId", COUNT(comment.id)::int AS "commentCount"
        FROM comment
        INNER JOIN requested_discs ON requested_discs.id = comment."discId"
        GROUP BY comment."discId"
      ),
      user_rates AS (
        SELECT DISTINCT ON (rate."discId")
          rate."discId" AS "discId",
          rate.id,
          rate.rate,
          rate.cover
        FROM rate
        INNER JOIN requested_discs ON requested_discs.id = rate."discId"
        WHERE rate."userId" = $2
        ORDER BY
          rate."discId",
          GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt")) DESC,
          rate.id DESC
      ),
      user_favorites AS (
        SELECT DISTINCT ON (favorite."discId")
          favorite."discId" AS "discId",
          favorite.id
        FROM favorite
        INNER JOIN requested_discs ON requested_discs.id = favorite."discId"
        WHERE favorite."userId" = $2
        ORDER BY favorite."discId", favorite.id
      ),
      user_pendings AS (
        SELECT DISTINCT ON (pending."discId")
          pending."discId" AS "discId",
          pending.id
        FROM pending
        INNER JOIN requested_discs ON requested_discs.id = pending."discId"
        WHERE pending."userId" = $2
        ORDER BY pending."discId", pending.id
      )
      SELECT
        disc.id AS id,
        disc.name AS name,
        disc.image AS image,
        CASE
          WHEN disc."releaseDate" IS NULL THEN NULL
          ELSE EXTRACT(YEAR FROM disc."releaseDate")::int
        END AS "releaseYear",
        disc."releaseDate"::text AS "releaseDate",
        disc.link AS link,
        COALESCE(disc.ep, false) AS ep,
        COALESCE(disc.debut, false) AS debut,
        genre.name AS "genreName",
        genre.color AS "genreColor",
        rate_stats."averageRate" AS "averageRate",
        rate_stats."averageCover" AS "averageCover",
        COALESCE(rate_stats."voteCount", 0)::int AS "voteCount",
        COALESCE(comment_stats."commentCount", 0)::int AS "commentCount",
        user_rates.id AS "userRateId",
        user_rates.rate AS "userRate",
        user_rates.cover AS "userCover",
        user_favorites.id AS "favoriteId",
        user_pendings.id AS "pendingId"
      FROM requested_discs
      INNER JOIN disc ON disc.id = requested_discs.id
      LEFT JOIN genre ON genre.id = disc."genreId"
      LEFT JOIN rate_stats ON rate_stats."discId" = disc.id
      LEFT JOIN comment_stats ON comment_stats."discId" = disc.id
      LEFT JOIN user_rates ON user_rates."discId" = disc.id
      LEFT JOIN user_favorites ON user_favorites."discId" = disc.id
      LEFT JOIN user_pendings ON user_pendings."discId" = disc.id
      `,
      [discIds, userId],
    )) as ArtistDiscCardRow[];

    const cardsById = new Map(rows.map((row) => [row.id, mapDiscCard(row)]));

    return matches.map((match) => {
      const catalogDiscs = match.catalogDiscs.flatMap((disc) => {
        const card = cardsById.get(disc.id);
        return card ? [card] : [];
      });
      return {
        ...match,
        catalogDiscCount: catalogDiscs.length,
        catalogDiscs,
      };
    });
  }
}

function mapDiscCard(row: ArtistDiscCardRow): RatesArtistLastfmCatalogDiscDto {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    releaseYear: row.releaseYear === null ? null : Number(row.releaseYear),
    releaseDate: row.releaseDate,
    link: row.link,
    ep: row.ep,
    debut: row.debut,
    genre:
      row.genreName === null
        ? null
        : { name: row.genreName, color: row.genreColor },
    averageRate: toNullableNumber(row.averageRate),
    averageCover: toNullableNumber(row.averageCover),
    voteCount: Number(row.voteCount),
    commentCount: Number(row.commentCount),
    userRate:
      row.userRateId === null
        ? null
        : {
            id: row.userRateId,
            rate: toNullableNumber(row.userRate),
            cover: toNullableNumber(row.userCover),
          },
    favoriteId: row.favoriteId,
    pendingId: row.pendingId,
  };
}

function toNullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function emptyResponse(
  artistId: string,
  status: Exclude<LastfmArtistProfileLookup['status'], 'found'>,
): RatesArtistLastfmResponseDto {
  return {
    artistId,
    status,
    biography: null,
    tags: [],
    similarArtists: [],
    listeners: null,
    playCount: null,
    lastfmUrl: null,
  };
}

function mapProfile(
  artistId: string,
  lookup: Extract<LastfmArtistProfileLookup, { status: 'found' }>,
  similarArtists: Array<{ name: string; url: string | null }>,
  catalogMatches: ArtistCatalogDiscCardMatch[],
): RatesArtistLastfmResponseDto {
  const profile = lookup.profile;
  const summary = profile.biographySummary
    ? sanitizeHtml(profile.biographySummary, PLAIN_TEXT_OPTIONS)
        .trim()
        .slice(0, BIOGRAPHY_MAX_LENGTH) || null
    : null;
  const biographyUrl = safeLastfmUrl(profile.biographyUrl);
  const lastfmUrl = safeLastfmUrl(profile.url);

  return {
    artistId,
    status: 'available',
    biography:
      summary || biographyUrl
        ? { summary, url: biographyUrl ?? lastfmUrl }
        : null,
    tags: uniqueLinks(profile.tags),
    similarArtists: similarArtists.map((similarArtist, index) => ({
      ...similarArtist,
      ...(catalogMatches[index] ?? {
        catalogArtistId: null,
        catalogDiscCount: 0,
        catalogDiscs: [],
      }),
    })),
    listeners: parseCount(profile.listeners),
    playCount: parseCount(profile.playCount),
    lastfmUrl,
  };
}

function uniqueLinks(
  values: Array<{ name: string; url: string | null }>,
): Array<{ name: string; url: string | null }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; url: string | null }> = [];

  for (const value of values) {
    const key = normalizeName(value.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ name: value.name, url: safeLastfmUrl(value.url) });
    if (result.length === LASTFM_LIST_LIMIT) break;
  }
  return result;
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function safeLastfmUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['last.fm', 'www.last.fm'].includes(hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return null;
    }
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

function parseCount(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}
