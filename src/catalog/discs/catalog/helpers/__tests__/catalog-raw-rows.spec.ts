import { indexCatalogRawRows } from '../catalog-raw-rows';

describe('indexCatalogRawRows', () => {
  it('indexes the stable lowercase random-hydration ID alias', () => {
    const row = {
      disc_id_for_mapping: 'disc-id',
      averagerate: null,
      averageCover: null,
      rateCount: null,
      commentCount: null,
    };

    expect(indexCatalogRawRows([row]).get('disc-id')).toBe(row);
  });

  it('keeps the last raw row indexed for a repeated disc ID', () => {
    const first = {
      discId: 'disc-id',
      averagerate: '1',
      averageCover: null,
      rateCount: '1',
      commentCount: '1',
    };
    const last = { ...first, averagerate: '2' };

    expect(indexCatalogRawRows([first, last]).get('disc-id')).toBe(last);
  });
});
