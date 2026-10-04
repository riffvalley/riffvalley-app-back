import { mapOptionRows } from './map-option-rows';

describe('mapOptionRows', () => {
  it('converts scalar options and passes object options through unchanged', () => {
    expect(mapOptionRows('year', [{ year: '1998' }, { year: null }])).toEqual([1998, 0]);
    expect(mapOptionRows('ep', [{ ep: 0 }, { ep: 1 }])).toEqual([false, true]);
    expect(mapOptionRows('debut', [{ debut: false }, { debut: true }])).toEqual([false, true]);

    const rows = [{ id: 'genre-id', name: 'Genre', color: '#123456' }];
    expect(mapOptionRows('genre', rows)).toBe(rows);
  });
});
