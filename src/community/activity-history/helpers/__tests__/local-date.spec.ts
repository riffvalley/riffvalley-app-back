import { createLocalDateResolver } from '../local-date';

describe('createLocalDateResolver', () => {
  it('assigns events close to UTC midnight to the client local date', () => {
    const localDateFor = createLocalDateResolver('Europe/Madrid');

    expect(localDateFor('2026-10-28T23:30:00.000000Z')).toBe('2026-10-29');
    expect(localDateFor('2026-10-29T22:59:59.999999Z')).toBe('2026-10-29');
  });

  it('uses IANA calendar rules across the spring DST transition', () => {
    const localDateFor = createLocalDateResolver('Europe/Madrid');

    expect(localDateFor('2026-03-29T00:59:59.999999Z')).toBe('2026-03-29');
    expect(localDateFor('2026-03-29T01:00:00.000000Z')).toBe('2026-03-29');
  });

  it('uses IANA calendar rules across the autumn DST transition', () => {
    const localDateFor = createLocalDateResolver('Europe/Madrid');

    expect(localDateFor('2026-10-25T00:30:00.000000Z')).toBe('2026-10-25');
    expect(localDateFor('2026-10-25T01:30:00.000000Z')).toBe('2026-10-25');
  });
});
