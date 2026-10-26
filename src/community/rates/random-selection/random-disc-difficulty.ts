export const RANDOM_DISC_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;

export type RandomDiscDifficulty = (typeof RANDOM_DISC_DIFFICULTIES)[number];

export type RandomDiscRateCriteria = {
  notRatedPredicate: string;
  communityVotePredicates: string[];
  genrePreferencePredicate?: string;
  parameters: Record<string, string | number>;
  priorityOrder?: string;
};
