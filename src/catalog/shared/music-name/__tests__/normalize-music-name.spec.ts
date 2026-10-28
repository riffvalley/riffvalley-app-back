import {
  compareNormalizedMusicNames,
  getMusicNameVariants,
  normalizeMusicName,
} from '../normalize-music-name';

describe('normalizeMusicName', () => {
  it.each([
    ['Sólstafir', 'solstafir'],
    ['MØL', 'mol'],
    ['Motörhead', 'motorhead'],
    ['Björk', 'bjork'],
    ['Dödsrit', 'dodsrit'],
    ['Æther', 'aether'],
    ['cœur', 'coeur'],
    ['Łódź', 'lodz'],
    ['Ðor', 'dor'],
    ['Þór', 'thor'],
    ['Straße', 'strasse'],
    ['MOL', 'mol'],
    ['Masse', 'masse'],
    ['Aether', 'aether'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeMusicName(input)).toBe(expected);
  });

  it('normalizes NFC and NFD forms to the same key', () => {
    expect(normalizeMusicName('Björk')).toBe(normalizeMusicName('Bjo\u0308rk'));
  });

  it('applies compatibility decomposition without transliterating other scripts', () => {
    expect(normalizeMusicName('ＡＬＢＵＭ ①')).toBe('album 1');
    expect(normalizeMusicName('東京')).toBe('東京');
  });

  it('preserves combining marks attached to non-Latin letters', () => {
    expect(normalizeMusicName('किताब')).toBe('किताब');
    expect(normalizeMusicName('عَرَبِي')).toBe('عَرَبِي');
  });

  it('treats apostrophe forms consistently without joining surrounding words', () => {
    expect(normalizeMusicName("Guns N' Roses")).toBe('guns n roses');
    expect(normalizeMusicName('Guns N’ Roses')).toBe('guns n roses');
    expect(normalizeMusicName('O’Connor')).toBe('oconnor');
  });

  it('uses punctuation as a word separator', () => {
    expect(normalizeMusicName('Post-Metal')).toBe('post metal');
    expect(normalizeMusicName('Post—Metal')).toBe('post metal');
    expect(normalizeMusicName('Album: Subtitle / Part II')).toBe(
      'album subtitle part ii',
    );
    expect(normalizeMusicName('Album (Live!)')).toBe('album live');
    expect(normalizeMusicName('A+B & C')).toBe('a b c');
  });

  it('collapses repeated ASCII and Unicode whitespace', () => {
    expect(normalizeMusicName('  Post\u00A0\t  Metal  ')).toBe('post metal');
  });

  it('is empty for empty or separator-only input', () => {
    expect(normalizeMusicName('')).toBe('');
    expect(normalizeMusicName(' — … ')).toBe('');
  });

  it('is deterministic, idempotent, and does not mutate its input', () => {
    const original = 'MØL — Björk';
    const before = original;
    const normalized = normalizeMusicName(original);

    expect(normalizeMusicName(original)).toBe(normalized);
    expect(normalizeMusicName(normalized)).toBe(normalized);
    expect(original).toBe(before);
  });

  it('handles long names and combined punctuation', () => {
    const longName = `${'Ä'.repeat(500)} — (Live!!!) / Part II`;
    expect(normalizeMusicName(longName)).toBe(
      `${'a'.repeat(500)} live part ii`,
    );
  });

  it('does not transliterate or erase letters from other writing systems', () => {
    expect(normalizeMusicName('КИНО')).toBe('кино');
    expect(normalizeMusicName('東京')).not.toBe('tokyo');
  });
});

describe('getMusicNameVariants', () => {
  it.each([
    [
      'The Secrets of Pandora',
      ['the secrets of pandora', 'secrets of pandora'],
    ],
    ['A Perfect Circle', ['a perfect circle', 'perfect circle']],
    ['An Example', ['an example', 'example']],
  ])(
    'returns one optional initial-article variant for %s',
    (input, expected) => {
      expect(getMusicNameVariants(input)).toEqual(expected);
    },
  );

  it('does not remove non-initial articles or create recursive variants', () => {
    expect(getMusicNameVariants('Secrets of The Pandora')).toEqual([
      'secrets of the pandora',
    ]);
    expect(getMusicNameVariants('The A Perfect Circle')).toEqual([
      'the a perfect circle',
      'a perfect circle',
    ]);
  });

  it('does not create variants for empty names', () => {
    expect(getMusicNameVariants('   ')).toEqual([]);
  });
});

describe('compareNormalizedMusicNames', () => {
  it.each([
    ['MOL', 'MØL'],
    ['Solstafir', 'Sólstafir'],
    ['Motorhead', 'Motörhead'],
    ['Bjork', 'Björk'],
    ['Dodsrit', 'Dödsrit'],
    ['The Secrets of Pandora', 'Secrets of Pandora'],
    ['Post-Metal', 'Post Metal'],
  ])('compares %s and %s as compatible candidate text', (left, right) => {
    expect(compareNormalizedMusicNames(left, right)).toBe(true);
  });

  it.each([
    ['Banda A', 'Banda B'],
    ['The Cure', 'Cureless'],
    ['Post Metal', 'Postmetal'],
    ['Album', 'Another Album'],
    ['東京', 'tokyo'],
  ])(
    'does not compare %s and %s as compatible candidate text',
    (left, right) => {
      expect(compareNormalizedMusicNames(left, right)).toBe(false);
    },
  );

  it('documents textual collisions without treating them as identity', () => {
    expect(normalizeMusicName('MØL')).toBe(normalizeMusicName('MOL'));
    expect(normalizeMusicName('Maße')).toBe(normalizeMusicName('Masse'));
    expect(normalizeMusicName('Æther')).toBe(normalizeMusicName('Aether'));
    expect(compareNormalizedMusicNames('Maße', 'Masse')).toBe(true);
    expect(compareNormalizedMusicNames('MØL', 'MOL')).toBe(true);
    expect(compareNormalizedMusicNames('Æther', 'Aether')).toBe(true);
  });

  it('matches initial-article variants symmetrically as candidate text', () => {
    expect(
      compareNormalizedMusicNames(
        'The Secrets of Pandora',
        'Secrets of Pandora',
      ),
    ).toBe(true);
    expect(
      compareNormalizedMusicNames(
        'Secrets of Pandora',
        'The Secrets of Pandora',
      ),
    ).toBe(true);
  });

  it('does not match two empty names', () => {
    expect(compareNormalizedMusicNames('', ' ')).toBe(false);
  });
});
