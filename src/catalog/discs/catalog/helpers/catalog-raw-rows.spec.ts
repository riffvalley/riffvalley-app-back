import { indexCatalogRawRows } from './catalog-raw-rows';

describe('indexCatalogRawRows', () => {
  it('keeps the last raw row indexed for a repeated disc ID', () => {
    const first = { discId: 'disc-id', averagerate: '1', averageCover: null, rateCount: '1', commentCount: '1' };
    const last = { ...first, averagerate: '2' };

    expect(indexCatalogRawRows([first, last]).get('disc-id')).toBe(last);
  });
});
