import { RatesRandomSelectionService } from '../rates-random-selection.service';

describe('RatesRandomSelectionService', () => {
  const service = new RatesRandomSelectionService();

  it('defines community-unrated discs by the absence of any non-null musical rate', () => {
    const predicate = service.getUnratedByCommunityPredicate();

    expect(predicate).toContain('NOT EXISTS');
    expect(predicate).toContain('FROM rate community_rate');
    expect(predicate).toContain('community_rate.rate IS NOT NULL');
    expect(predicate).not.toContain('cover');
    expect(predicate).not.toContain('rate_vote_events');
    expect(predicate).not.toContain('randomUserId');
    expect(predicate).not.toContain('>=');
    expect(predicate).not.toContain('> 0');
  });

  it.each([
    ['easy', 3, 5, undefined],
    ['normal', 7, 2, 4],
  ] as const)(
    'builds %s criteria from distinct musical votes and its genre limit',
    (difficulty, genreLimit, minimum, maximum) => {
      const criteria = service.getDiscCriteria('user-id', difficulty);

      expect(criteria.parameters).toMatchObject({
        randomUserId: 'user-id',
        randomGenreLimit: genreLimit,
        randomMinimumVotes: minimum,
      });
      expect(criteria.communityVoteCountExpression).toContain(
        'COUNT(DISTINCT community_rate."userId")',
      );
      expect(criteria.communityVoteCountExpression).toContain(
        'community_rate.rate IS NOT NULL',
      );
      expect(criteria.communityVotePredicates[0]).toContain(
        '>= :randomMinimumVotes',
      );
      if (maximum !== undefined) {
        expect(criteria.communityVotePredicates[1]).toContain(
          '<= :randomMaximumVotes',
        );
      } else {
        expect(criteria.communityVotePredicates).toHaveLength(1);
      }
      expect(criteria.genrePreferencePredicate).toContain(
        'COUNT(DISTINCT rated_disc.id)',
      );
      expect(criteria.genrePreferencePredicate).toContain(
        'rated_disc."genreId" ASC',
      );
      expect(criteria.notRatedPredicate).toContain(
        'user_rate.rate IS NOT NULL',
      );
      if (maximum !== undefined) {
        expect(criteria.parameters.randomMaximumVotes).toBe(maximum);
      } else {
        expect(criteria.parameters.randomMaximumVotes).toBeUndefined();
      }
      expect(criteria.priorityOrder).toBeUndefined();
    },
  );

  it('keeps hard candidates at zero or one vote and prioritizes unseen genres', () => {
    const criteria = service.getDiscCriteria('user-id', 'hard');
    const sql = [
      ...criteria.communityVotePredicates,
      criteria.genrePreferencePredicate,
    ].join('\n');

    expect(criteria.parameters).toEqual({
      randomUserId: 'user-id',
      randomMaximumVotes: 1,
      randomGenreLimit: 7,
    });
    expect(sql).toContain('community_rate.rate IS NOT NULL');
    expect(criteria.communityVotePredicates[0]).toContain(
      '<= :randomMaximumVotes',
    );
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('disc."genreId" NOT IN');
    expect(criteria.priorityOrder).toContain('THEN 0 ELSE 1 END');
  });

  it('builds deduplicated cover aggregates and excludes only the user cover vote', () => {
    const criteria = service.getCoverFeaturedCriteria('user-id');
    expect(criteria.parameters).toEqual({ coverFeaturedUserId: 'user-id' });
    expect(criteria.voteCountExpression).toContain('COUNT(*)');
    expect(criteria.voteCountExpression).toContain(
      'DISTINCT ON (cover_rate."userId")',
    );
    expect(criteria.averageExpression).toContain('AVG(cover_votes.cover)');
    expect(criteria.voteCountExpression).toContain(
      'cover_rate.cover IS NOT NULL',
    );
    expect(criteria.voteCountExpression).toContain(
      'COALESCE(cover_rate."editedAt", cover_rate."createdAt") DESC',
    );
    expect(criteria.voteCountExpression).toContain('cover_rate.id DESC');
    expect(criteria.notRatedPredicate).toContain(
      'user_cover_rate.cover IS NOT NULL',
    );
    expect(criteria.notRatedPredicate).not.toContain('user_cover_rate.rate');
  });
});
