import { Injectable } from '@nestjs/common';
import {
  RandomDiscDifficulty,
  RandomDiscRateCriteria,
} from './random-disc-difficulty';

@Injectable()
export class RatesRandomSelectionService {
  getDiscCriteria(
    userId: string,
    difficulty: RandomDiscDifficulty,
  ): RandomDiscRateCriteria {
    const communityVoteCountExpression = `(SELECT COUNT(DISTINCT community_rate."userId")
      FROM rate community_rate
      WHERE community_rate."discId" = disc.id
        AND community_rate.rate IS NOT NULL)`;
    const criteria: RandomDiscRateCriteria = {
      notRatedPredicate: `NOT EXISTS (
          SELECT 1 FROM rate user_rate
          WHERE user_rate."discId" = disc.id
            AND user_rate."userId" = :randomUserId
            AND user_rate.rate IS NOT NULL
        )`,
      communityVotePredicates: [],
      communityVoteCountExpression,
      parameters: { randomUserId: userId },
    };

    if (difficulty === 'easy' || difficulty === 'normal') {
      const genreLimit = difficulty === 'easy' ? 3 : 7;
      const minimumVotes = difficulty === 'easy' ? 5 : 2;
      const maximumVotes = difficulty === 'easy' ? undefined : 4;

      criteria.communityVotePredicates.push(
        `${communityVoteCountExpression} >= :randomMinimumVotes`,
      );
      if (maximumVotes !== undefined) {
        criteria.communityVotePredicates.push(
          `${communityVoteCountExpression} <= :randomMaximumVotes`,
        );
      }
      criteria.genrePreferencePredicate = `(NOT EXISTS (
          SELECT 1 FROM rate genre_rate
          INNER JOIN disc rated_disc ON rated_disc.id = genre_rate."discId"
          WHERE genre_rate."userId" = :randomUserId
            AND genre_rate.rate IS NOT NULL
            AND rated_disc."genreId" IS NOT NULL
        ) OR disc."genreId" IN (
          SELECT rated_disc."genreId"
          FROM rate genre_rate
          INNER JOIN disc rated_disc ON rated_disc.id = genre_rate."discId"
          WHERE genre_rate."userId" = :randomUserId
            AND genre_rate.rate IS NOT NULL
            AND rated_disc."genreId" IS NOT NULL
          GROUP BY rated_disc."genreId"
          ORDER BY COUNT(DISTINCT rated_disc.id) DESC, rated_disc."genreId" ASC
          LIMIT :randomGenreLimit
        ))`;
      criteria.parameters.randomMinimumVotes = minimumVotes;
      criteria.parameters.randomGenreLimit = genreLimit;
      if (maximumVotes !== undefined) {
        criteria.parameters.randomMaximumVotes = maximumVotes;
      }
      return criteria;
    }

    criteria.communityVotePredicates.push(
      `${communityVoteCountExpression} <= :randomMaximumVotes`,
    );
    criteria.genrePreferencePredicate = `(
        NOT EXISTS (
          SELECT 1 FROM rate any_genre_rate
          INNER JOIN disc any_rated_disc ON any_rated_disc.id = any_genre_rate."discId"
          WHERE any_genre_rate."userId" = :randomUserId
            AND any_genre_rate.rate IS NOT NULL
            AND any_rated_disc."genreId" IS NOT NULL
        )
        OR NOT EXISTS (
          SELECT 1 FROM rate same_genre_rate
          INNER JOIN disc same_genre_disc ON same_genre_disc.id = same_genre_rate."discId"
          WHERE same_genre_rate."userId" = :randomUserId
            AND same_genre_rate.rate IS NOT NULL
            AND same_genre_disc."genreId" = disc."genreId"
        )
        OR disc."genreId" NOT IN (
          SELECT top_genres."genreId" FROM (
            SELECT rated_disc."genreId"
            FROM rate genre_rate
            INNER JOIN disc rated_disc ON rated_disc.id = genre_rate."discId"
            WHERE genre_rate."userId" = :randomUserId
              AND genre_rate.rate IS NOT NULL
              AND rated_disc."genreId" IS NOT NULL
            GROUP BY rated_disc."genreId"
            ORDER BY COUNT(DISTINCT rated_disc.id) DESC, rated_disc."genreId" ASC
            LIMIT :randomGenreLimit
          ) top_genres
        )
      )`;
    criteria.parameters.randomMaximumVotes = 1;
    criteria.parameters.randomGenreLimit = 7;
    criteria.priorityOrder = `CASE WHEN NOT EXISTS (
      SELECT 1 FROM rate same_genre_rate
      INNER JOIN disc same_genre_disc ON same_genre_disc.id = same_genre_rate."discId"
      WHERE same_genre_rate."userId" = :randomUserId
        AND same_genre_rate.rate IS NOT NULL
        AND same_genre_disc."genreId" = disc."genreId"
    ) THEN 0 ELSE 1 END`;
    return criteria;
  }
}
