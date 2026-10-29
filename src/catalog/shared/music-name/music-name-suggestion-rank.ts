import { escapeLikeLiteral, getMusicNameSearchKeys } from './music-name-search';
import { normalizeMusicName } from './normalize-music-name';

export interface MusicNameSuggestionRankField {
  normalizedColumn: string;
}

/**
 * Builds a deterministic, parameterized relevance expression for suggestion
 * queries. Field groups are ordered by domain priority; each group's primary
 * groups receive equal relevance. Exact, prefix, and partial primary matches
 * rank before optional article variants.
 */
export function buildMusicNameSuggestionRank(
  value: string,
  fieldGroups: MusicNameSuggestionRankField[][],
  parameterPrefix = 'suggestionRank',
): { expression: string; parameters: Record<string, string> } {
  const primary = normalizeMusicName(value);
  const alternatives = getMusicNameSearchKeys(value).filter(
    (key) => key !== primary,
  );
  const parameters: Record<string, string> = {};

  // Build ordered tiers separately so every field in one tier has equal rank.
  const rankedConditions: string[] = [];
  let rank = 0;
  const appendTier = (
    fields: MusicNameSuggestionRankField[],
    keys: string[],
    operator: '=' | 'LIKE',
    pattern: (key: string) => string,
    excludeArticlePrefixes = false,
  ) => {
    if (keys.length === 0 || fields.length === 0) return;
    const conditions = fields.flatMap(({ normalizedColumn }) =>
      keys.map((key) => {
        const parameter = `${parameterPrefix}${Object.keys(parameters).length}`;
        parameters[parameter] = pattern(key);
        const condition =
          operator === '='
            ? `${normalizedColumn} = :${parameter}`
            : `${normalizedColumn} LIKE :${parameter} ESCAPE '\\'`;
        if (!excludeArticlePrefixes) return condition;

        const articleConditions = alternatives.map((alternative) => {
          const articleParameter = `${parameterPrefix}${Object.keys(parameters).length}`;
          parameters[articleParameter] = `${escapeLikeLiteral(alternative)}%`;
          return `${normalizedColumn} LIKE :${articleParameter} ESCAPE '\\'`;
        });
        return articleConditions.length
          ? `(${condition} AND NOT (${articleConditions.join(' OR ')}))`
          : condition;
      }),
    );
    if (conditions.length === 0) return;
    rankedConditions.push(`WHEN ${conditions.join(' OR ')} THEN ${rank}`);
    rank += 1;
  };

  for (const group of fieldGroups) {
    appendTier(group, [primary], '=', (key) => key);
  }
  for (const group of fieldGroups) {
    appendTier(group, [primary], 'LIKE', (key) => `${escapeLikeLiteral(key)}%`);
  }
  for (const group of fieldGroups) {
    appendTier(
      group,
      [primary],
      'LIKE',
      (key) => `%${escapeLikeLiteral(key)}%`,
      true,
    );
  }

  for (const group of fieldGroups) {
    appendTier(group, alternatives, '=', (key) => key);
  }
  for (const group of fieldGroups) {
    appendTier(
      group,
      alternatives,
      'LIKE',
      (key) => `${escapeLikeLiteral(key)}%`,
    );
  }
  for (const group of fieldGroups) {
    appendTier(
      group,
      alternatives,
      'LIKE',
      (key) => `%${escapeLikeLiteral(key)}%`,
    );
  }

  return {
    expression: `CASE ${rankedConditions.join(' ')} ELSE ${rank} END`,
    parameters,
  };
}
