import { getMusicNameVariants } from './normalize-music-name';

const OPTIONAL_INITIAL_ARTICLES = ['the', 'a', 'an'] as const;

/**
 * Produces the bounded keys needed for symmetric matching of an optional
 * English initial article. These keys retrieve candidates only.
 */
export function getMusicNameSearchKeys(value: string): string[] {
  const variants = getMusicNameVariants(value);
  const keys = new Set(variants);

  for (const variant of variants) {
    if (/^(?:the|a|an)\s/u.test(variant)) continue;
    for (const article of OPTIONAL_INITIAL_ARTICLES) {
      keys.add(`${article} ${variant}`);
    }
  }

  return [...keys];
}

/** Escapes LIKE metacharacters so user input is always interpreted literally. */
export function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

/**
 * Builds normalized contains patterns for a Catalog partial search. An empty
 * array means the input must produce no matches and must not reach SQL.
 */
export function getMusicNameContainsPatterns(value: string): string[] {
  return getMusicNameVariants(value).map(
    (key) => `%${escapeLikeLiteral(key)}%`,
  );
}

export function buildMusicNamePartialPredicate(
  value: string,
  normalizedColumn: string,
  legacyColumn: string,
  legacyValue: string,
  parameterPrefix = 'musicSearch',
): { predicate: string; parameters: Record<string, string> } {
  const patterns = getMusicNameContainsPatterns(value);
  if (patterns.length === 0) {
    return { predicate: '1 = 0', parameters: {} };
  }

  const normalizedConditions = patterns.map(
    (_, index) =>
      `${normalizedColumn} LIKE :${parameterPrefix}${index} ESCAPE '\\'`,
  );
  const parameters = Object.fromEntries(
    patterns.map((pattern, index) => [`${parameterPrefix}${index}`, pattern]),
  );
  const legacyParameter = `${parameterPrefix}Legacy`;
  parameters[legacyParameter] = `%${escapeLikeLiteral(legacyValue)}%`;

  return {
    predicate: `(${normalizedConditions.join(' OR ')} OR (${normalizedColumn} IS NULL AND ${legacyColumn} LIKE :${legacyParameter} ESCAPE '\\'))`,
    parameters,
  };
}

export function buildMusicNameMultiColumnPartialPredicate(
  value: string,
  fields: Array<{
    normalizedColumn: string;
    legacyColumn: string;
    legacyValue: string;
    legacyOperator?: 'LIKE' | 'ILIKE';
  }>,
  parameterPrefix = 'musicSearch',
): { predicate: string; parameters: Record<string, string> } {
  const patterns = getMusicNameContainsPatterns(value);
  if (patterns.length === 0) {
    return { predicate: '1 = 0', parameters: {} };
  }

  const parameters = Object.fromEntries(
    patterns.map((pattern, index) => [`${parameterPrefix}${index}`, pattern]),
  );
  const clauses = fields.flatMap((field, fieldIndex) => {
    const normalizedConditions = patterns.map(
      (_, patternIndex) =>
        `${field.normalizedColumn} LIKE :${parameterPrefix}${patternIndex} ESCAPE '\\'`,
    );
    const legacyParameter = `${parameterPrefix}Legacy${fieldIndex}`;
    parameters[legacyParameter] = `%${escapeLikeLiteral(field.legacyValue)}%`;
    return [
      `(${normalizedConditions.join(' OR ')})`,
      `(${field.normalizedColumn} IS NULL AND ${field.legacyColumn} ${field.legacyOperator ?? 'LIKE'} :${legacyParameter} ESCAPE '\\')`,
    ];
  });

  return { predicate: `(${clauses.join(' OR ')})`, parameters };
}
