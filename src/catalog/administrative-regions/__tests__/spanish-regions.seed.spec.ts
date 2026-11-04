import { buildSpanishRegionSeed } from '../seeds/spanish-regions.seed';
import { SPANISH_ADMINISTRATIVE_REGIONS } from '../seeds/spanish-regions.data';

describe('Spanish administrative region seed data', () => {
  it('contains the 17 autonomous communities and two autonomous cities with official INE codes', () => {
    expect(SPANISH_ADMINISTRATIVE_REGIONS).toHaveLength(19);
    expect(SPANISH_ADMINISTRATIVE_REGIONS.map(({ code }) => code)).toEqual(
      Array.from({ length: 19 }, (_, index) =>
        String(index + 1).padStart(2, '0'),
      ),
    );
    expect(SPANISH_ADMINISTRATIVE_REGIONS.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['Cantabria', 'Asturias', 'Ceuta', 'Melilla']),
    );
  });

  it('builds a repeatable upsert keyed by country and normalized region name', () => {
    const first = buildSpanishRegionSeed('country-id');
    const second = buildSpanishRegionSeed('country-id');
    expect(first).toEqual(second);
    expect(first.regions).toHaveLength(19);
    expect(
      new Set(first.regions.map(({ nameNormalized }) => nameNormalized)).size,
    ).toBe(19);
    expect(
      first.regions.every(({ countryId }) => countryId === 'country-id'),
    ).toBe(true);
    expect(first.conflictPaths).toEqual(['countryId', 'nameNormalized']);
  });
});
