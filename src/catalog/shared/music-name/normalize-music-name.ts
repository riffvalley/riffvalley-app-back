const SPECIAL_LETTER_EQUIVALENCES: Readonly<Record<string, string>> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ł: 'l',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
};

const COMBINING_MARK = /\p{M}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;
const APOSTROPHE = /^[\u0027\u02BC\u2018\u2019\uFF07]$/u;

/**
 * Creates a deterministic search key without changing the supplied name.
 * This is textual normalization only; it does not establish entity identity.
 */
export function normalizeMusicName(value: string): string {
  const decomposed = value.normalize('NFKD').toLowerCase();
  let normalized = '';
  let previousBaseWasLatin = false;

  for (const character of decomposed) {
    if (COMBINING_MARK.test(character)) {
      if (!previousBaseWasLatin) normalized += character;
      continue;
    }

    if (APOSTROPHE.test(character)) {
      previousBaseWasLatin = false;
      continue;
    }

    const equivalent = SPECIAL_LETTER_EQUIVALENCES[character];
    if (equivalent !== undefined) {
      normalized += equivalent;
      previousBaseWasLatin = true;
      continue;
    }

    normalized += character;
    previousBaseWasLatin =
      LETTER.test(character) && LATIN_LETTER.test(character);
  }

  return normalized
    .replace(/\p{P}/gu, ' ')
    .replace(/[+&]/gu, ' ')
    .replace(/\p{White_Space}+/gu, ' ')
    .trim();
}

/**
 * Returns the primary normalized key and at most one article-free alternative.
 * Alternatives broaden candidate retrieval; they are not identity decisions.
 */
export function getMusicNameVariants(value: string): string[] {
  const primary = normalizeMusicName(value);
  if (!primary) return [];

  const variants = [primary];
  const withoutInitialArticle = primary.replace(/^(?:the|a|an)\s+(.+)$/u, '$1');

  if (withoutInitialArticle !== primary) variants.push(withoutInitialArticle);
  return variants;
}

/**
 * Compares primary keys and their deterministic article variants.
 * A positive result means candidate text compatibility, not shared identity.
 */
export function compareNormalizedMusicNames(
  left: string,
  right: string,
): boolean {
  const leftVariants = getMusicNameVariants(left);
  if (leftVariants.length === 0) return false;

  const rightVariants = new Set(getMusicNameVariants(right));
  return leftVariants.some((variant) => rightVariants.has(variant));
}
