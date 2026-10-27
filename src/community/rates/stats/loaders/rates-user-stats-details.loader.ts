import { Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import {
  RatesStatsControversialDiscDto,
  RatesStatsDiscDto,
  RatesStatsRatedDiscDto,
} from '../../dto/rates-user-stats.dto';

type TopDiscRawRow = {
  genreName: string | null;
  monthName: string | null;
  discId: string;
  discName: string;
  discImage: string | null;
  rate: string | number;
  artistName: string;
  genreColor: string | null;
};

type ControversialDiscRawRow = TopDiscRawRow & {
  userRate: string | number;
  communityAverage: string | number | null;
};

type DailyActivityRawRow = {
  date: string;
  count: string | number;
};

type YearComparisonRawRow = {
  currentVotes: string | number;
  currentMean: string | number | null;
  previousVotes: string | number;
  previousMean: string | number | null;
};

type RatedDiscRawRow = {
  id: string;
  name: string;
  rate: string | number;
  artistName: string;
  genreName: string | null;
  genreColor: string | null;
};

export interface RatesUserStatsDetails {
  topDiscsByGenre: Array<{ genre: string; disc: RatesStatsDiscDto }>;
  topDiscsByMonth: Array<{ month: string; disc: RatesStatsDiscDto }>;
  topDiscOverall: RatesStatsDiscDto | null;
  mostControversial: RatesStatsControversialDiscDto[];
  votesByDay: Array<{ date: string; count: number }>;
  yearOverYear: {
    current: { year: number; votes: number; mean: number };
    previous: { year: number; votes: number; mean: number };
  };
}

type RateQueryRepository = Pick<Repository<Rate>, 'query'>;

export async function loadRatesUserStatsDetails(
  repository: RateQueryRepository,
  userId: string,
  year: string | undefined,
  asOf: Date,
): Promise<RatesUserStatsDetails> {
  const [
    topDiscsByGenreRows,
    topDiscsByMonthRows,
    topDiscOverallRows,
    controversialRows,
    dailyActivityRows,
    yearComparisonRows,
  ] = await Promise.all([
    queryTopDiscsByGenre(repository, userId, year),
    queryTopDiscsByMonth(repository, userId, year),
    queryTopDiscOverall(repository, userId, year),
    queryMostControversial(repository, userId, year),
    queryDailyActivity(repository, userId, year),
    queryYearOverYear(repository, userId, asOf),
  ]);
  const comparison = yearComparisonRows[0];
  const currentYear = asOf.getFullYear();

  return {
    topDiscsByGenre: topDiscsByGenreRows.flatMap((row) =>
      row.genreName ? [{ genre: row.genreName, disc: mapTopDisc(row) }] : [],
    ),
    topDiscsByMonth: topDiscsByMonthRows.flatMap((row) =>
      row.monthName ? [{ month: row.monthName, disc: mapTopDisc(row) }] : [],
    ),
    topDiscOverall: topDiscOverallRows[0]
      ? mapTopDisc(topDiscOverallRows[0])
      : null,
    mostControversial: controversialRows.flatMap((row) => {
      if (row.communityAverage === null) return [];
      const userRate = Number(row.userRate);
      const communityAverage = Number(row.communityAverage);
      return [
        {
          id: row.discId,
          name: row.discName,
          image: row.discImage,
          userRate,
          communityAverage,
          diff: userRate - communityAverage,
          artist: { name: row.artistName },
          genre: row.genreName
            ? { name: row.genreName, color: row.genreColor }
            : null,
        },
      ];
    }),
    votesByDay: dailyActivityRows.map((row) => ({
      date: row.date,
      count: Number(row.count),
    })),
    yearOverYear: {
      current: {
        year: currentYear,
        votes: comparison ? Number(comparison.currentVotes) : 0,
        mean:
          comparison?.currentMean === null || !comparison
            ? 0
            : Number(comparison.currentMean),
      },
      previous: {
        year: currentYear - 1,
        votes: comparison ? Number(comparison.previousVotes) : 0,
        mean:
          comparison?.previousMean === null || !comparison
            ? 0
            : Number(comparison.previousMean),
      },
    },
  };
}

export async function loadUserRatedDiscs(
  repository: RateQueryRepository,
  userId: string,
  year?: string,
): Promise<RatesStatsRatedDiscDto[]> {
  const parameters: unknown[] = [userId];
  const yearFilter = year ? `AND TO_CHAR(disc."releaseDate", 'YYYY') = $2` : '';
  if (year) parameters.push(year);

  const rows = (await repository.query(
    `
    SELECT
      disc.id AS id,
      disc.name AS name,
      rate.rate AS rate,
      artist.name AS "artistName",
      genre.name AS "genreName",
      genre.color AS "genreColor"
    FROM rate
    INNER JOIN disc ON disc.id = rate."discId"
    INNER JOIN artist ON artist.id = disc."artistId"
    LEFT JOIN genre ON genre.id = disc."genreId"
    WHERE rate."userId" = $1
      AND rate.rate IS NOT NULL
      ${yearFilter}
    `,
    parameters,
  )) as RatedDiscRawRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    rate: Number(row.rate),
    artist: { name: row.artistName },
    genre: row.genreName
      ? { name: row.genreName, color: row.genreColor }
      : null,
  }));
}

async function queryTopDiscsByGenre(
  repository: RateQueryRepository,
  userId: string,
  year?: string,
): Promise<TopDiscRawRow[]> {
  const parameters: unknown[] = [userId];
  const yearFilter = year ? `AND TO_CHAR(disc."releaseDate", 'YYYY') = $2` : '';
  if (year) parameters.push(year);
  return (await repository.query(
    `
    SELECT "genreName", NULL::text AS "monthName", "discId", "discName",
           "discImage", rate, "artistName", "genreColor"
    FROM (
      SELECT
        genre.name AS "genreName",
        disc.id AS "discId",
        disc.name AS "discName",
        disc.image AS "discImage",
        rate.rate AS rate,
        artist.name AS "artistName",
        genre.color AS "genreColor",
        ROW_NUMBER() OVER (
          PARTITION BY genre.id
          ORDER BY rate.rate DESC, rate."createdAt" DESC, rate.id DESC
        ) AS position
      FROM rate
      INNER JOIN disc ON disc.id = rate."discId"
      INNER JOIN artist ON artist.id = disc."artistId"
      INNER JOIN genre ON genre.id = disc."genreId"
      WHERE rate."userId" = $1 AND rate.rate IS NOT NULL ${yearFilter}
    ) ranked
    WHERE position = 1
    `,
    parameters,
  )) as TopDiscRawRow[];
}

async function queryTopDiscsByMonth(
  repository: RateQueryRepository,
  userId: string,
  year?: string,
): Promise<TopDiscRawRow[]> {
  const parameters: unknown[] = [userId];
  const yearFilter = year ? `AND TO_CHAR(disc."releaseDate", 'YYYY') = $2` : '';
  if (year) parameters.push(year);
  return (await repository.query(
    `
    SELECT "genreName", "monthName", "discId", "discName",
           "discImage", rate, "artistName", "genreColor"
    FROM (
      SELECT
        BTRIM(TO_CHAR(rate."createdAt", 'Month')) AS "monthName",
        disc.id AS "discId",
        disc.name AS "discName",
        disc.image AS "discImage",
        rate.rate AS rate,
        artist.name AS "artistName",
        genre.name AS "genreName",
        genre.color AS "genreColor",
        ROW_NUMBER() OVER (
          PARTITION BY EXTRACT(MONTH FROM rate."createdAt")
          ORDER BY rate.rate DESC, rate."createdAt" DESC, rate.id DESC
        ) AS position
      FROM rate
      INNER JOIN disc ON disc.id = rate."discId"
      INNER JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE rate."userId" = $1 AND rate.rate IS NOT NULL ${yearFilter}
    ) ranked
    WHERE position = 1
    `,
    parameters,
  )) as TopDiscRawRow[];
}

async function queryTopDiscOverall(
  repository: RateQueryRepository,
  userId: string,
  year?: string,
): Promise<TopDiscRawRow[]> {
  const parameters: unknown[] = [userId];
  const yearFilter = year ? `AND TO_CHAR(disc."releaseDate", 'YYYY') = $2` : '';
  if (year) parameters.push(year);
  return (await repository.query(
    `
    SELECT genre.name AS "genreName", NULL::text AS "monthName",
           disc.id AS "discId", disc.name AS "discName",
           disc.image AS "discImage", rate.rate AS rate,
           artist.name AS "artistName", genre.color AS "genreColor"
    FROM rate
    INNER JOIN disc ON disc.id = rate."discId"
    INNER JOIN artist ON artist.id = disc."artistId"
    LEFT JOIN genre ON genre.id = disc."genreId"
    WHERE rate."userId" = $1 AND rate.rate IS NOT NULL ${yearFilter}
    ORDER BY rate.rate DESC, rate."createdAt" DESC, rate.id DESC
    LIMIT 1
    `,
    parameters,
  )) as TopDiscRawRow[];
}

async function queryMostControversial(
  repository: RateQueryRepository,
  userId: string,
  year?: string,
): Promise<ControversialDiscRawRow[]> {
  const parameters: unknown[] = [userId];
  const yearFilter = year ? `AND TO_CHAR(disc."releaseDate", 'YYYY') = $2` : '';
  if (year) parameters.push(year);
  return (await repository.query(
    `
    SELECT
      "genreName",
      NULL::text AS "monthName",
      "discId",
      "discName",
      "discImage",
      "userRate" AS rate,
      "artistName",
      "genreColor",
      "userRate",
      "communityAverage"
    FROM (
      SELECT
        disc.id AS "discId",
        disc.name AS "discName",
        disc.image AS "discImage",
        user_rate.rate AS "userRate",
        (SELECT AVG(community_rate.rate)
         FROM rate community_rate
         WHERE community_rate."discId" = disc.id
           AND community_rate.rate IS NOT NULL) AS "communityAverage",
        artist.name AS "artistName",
        genre.name AS "genreName",
        genre.color AS "genreColor"
      FROM rate user_rate
      INNER JOIN disc ON disc.id = user_rate."discId"
      INNER JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE user_rate."userId" = $1
        AND user_rate.rate IS NOT NULL ${yearFilter}
    ) rated_disc
    WHERE "communityAverage" IS NOT NULL
    ORDER BY ABS("userRate" - "communityAverage") DESC,
             "discId" ASC, "userRate" DESC
    LIMIT 5
    `,
    parameters,
  )) as ControversialDiscRawRow[];
}

async function queryDailyActivity(
  repository: RateQueryRepository,
  userId: string,
  year?: string,
): Promise<DailyActivityRawRow[]> {
  const parameters: unknown[] = [userId];
  const yearFilter = year ? `AND TO_CHAR(disc."releaseDate", 'YYYY') = $2` : '';
  if (year) parameters.push(year);
  return (await repository.query(
    `
    SELECT TO_CHAR(rate."createdAt", 'YYYY-MM-DD') AS date,
           COUNT(rate.id)::int AS count
    FROM rate
    INNER JOIN disc ON disc.id = rate."discId"
    WHERE rate."userId" = $1 AND rate.rate IS NOT NULL ${yearFilter}
    GROUP BY date
    ORDER BY date ASC
    `,
    parameters,
  )) as DailyActivityRawRow[];
}

async function queryYearOverYear(
  repository: RateQueryRepository,
  userId: string,
  now: Date,
): Promise<YearComparisonRawRow[]> {
  const currentYear = now.getFullYear();
  const currentStart = new Date(currentYear, 0, 1);
  const previousStart = new Date(currentYear - 1, 0, 1);
  const previousEnd = new Date(now);
  previousEnd.setFullYear(currentYear - 1);
  return (await repository.query(
    `
    SELECT
      (COUNT(rate.id) FILTER (
        WHERE rate."createdAt" >= $2 AND rate."createdAt" <= $3
      ))::int AS "currentVotes",
      AVG(rate.rate) FILTER (
        WHERE rate."createdAt" >= $2 AND rate."createdAt" <= $3
      ) AS "currentMean",
      (COUNT(rate.id) FILTER (
        WHERE rate."createdAt" >= $4 AND rate."createdAt" <= $5
      ))::int AS "previousVotes",
      AVG(rate.rate) FILTER (
        WHERE rate."createdAt" >= $4 AND rate."createdAt" <= $5
      ) AS "previousMean"
    FROM rate
    WHERE rate."userId" = $1 AND rate.rate IS NOT NULL
    `,
    [userId, currentStart, now, previousStart, previousEnd],
  )) as YearComparisonRawRow[];
}

function mapTopDisc(row: TopDiscRawRow): RatesStatsDiscDto {
  return {
    id: row.discId,
    name: row.discName,
    image: row.discImage,
    rate: Number(row.rate),
    artist: { name: row.artistName },
    genre: row.genreName
      ? { name: row.genreName, color: row.genreColor }
      : null,
  };
}
