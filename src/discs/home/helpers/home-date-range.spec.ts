import { buildHomeDateRange } from './home-date-range';

describe('buildHomeDateRange', () => {
  it('builds the current WHERE form and Date bind values in order', () => {
    const result = buildHomeDateRange(
      'WHERE',
      ['2024-01-01', '2024-12-31'],
    );

    expect(result).toEqual({
      condition: 'WHERE d."releaseDate" BETWEEN $1 AND $2',
      params: [new Date('2024-01-01'), new Date('2024-12-31')],
    });
    expect(result.params[0]).toBeInstanceOf(Date);
    expect(result.params[1]).toBeInstanceOf(Date);
  });

  it('builds the current AND form for joined statistics queries', () => {
    expect(buildHomeDateRange('AND', ['2024-01-01', '2024-12-31'])).toEqual({
      condition: ' AND d."releaseDate" BETWEEN $1 AND $2',
      params: [new Date('2024-01-01'), new Date('2024-12-31')],
    });
  });

  it('returns empty condition and binds unless exactly two bounds are provided', () => {
    expect(buildHomeDateRange('WHERE')).toEqual({
      condition: '',
      params: [],
    });
    expect(buildHomeDateRange('AND', [])).toEqual({ condition: '', params: [] });
    expect(buildHomeDateRange('AND', ['2024-01-01'])).toEqual({ condition: '', params: [] });
    expect(buildHomeDateRange('WHERE', ['2024-01-01', '2024-12-31', 'extra'])).toEqual({
      condition: '',
      params: [],
    });
  });
});
