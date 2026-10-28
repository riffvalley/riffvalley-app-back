import { getMusicNameSearchKeys } from 'src/catalog/shared/music-name/music-name-search';

export interface DiscSuggestionRequest {
  id: string;
  discName: string;
  artistName: string;
}

export interface DiscSuggestionQuery {
  sql: string;
  parameters: [string[], string[], string[], string[], string[]];
}

/** Builds the batched, candidate-only lookup used by National Releases admin. */
export function buildDiscSuggestionQuery(
  releases: readonly DiscSuggestionRequest[],
): DiscSuggestionQuery {
  return {
    sql: `
      SELECT requested."releaseId" AS "releaseId", candidate.id AS "discId"
      FROM unnest($1::uuid[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[])
        AS requested("releaseId", "discName", "artistName", "discKeys", "artistKeys")
      LEFT JOIN LATERAL (
        SELECT disc.id
        FROM "disc" AS disc
        LEFT JOIN "artist" AS artist ON artist.id = disc."artistId"
        WHERE jsonb_array_length(requested."discKeys"::jsonb) > 0
          AND (
            disc.search_name_normalized = ANY(
              ARRAY(SELECT jsonb_array_elements_text(requested."discKeys"::jsonb))
            )
            OR (
              disc.search_name_normalized IS NULL
              AND LOWER(disc.name) = LOWER(requested."discName")
            )
          )
          AND jsonb_array_length(requested."artistKeys"::jsonb) > 0
          AND (
            artist.search_name_normalized = ANY(
              ARRAY(SELECT jsonb_array_elements_text(requested."artistKeys"::jsonb))
            )
            OR (
              artist.search_name_normalized IS NULL
              AND LOWER(artist.name) = LOWER(requested."artistName")
            )
          )
        LIMIT 1
      ) AS candidate ON TRUE
    `,
    parameters: [
      releases.map((release) => release.id),
      releases.map((release) => release.discName),
      releases.map((release) => release.artistName),
      releases.map((release) =>
        JSON.stringify(getMusicNameSearchKeys(release.discName)),
      ),
      releases.map((release) =>
        JSON.stringify(getMusicNameSearchKeys(release.artistName)),
      ),
    ],
  };
}
