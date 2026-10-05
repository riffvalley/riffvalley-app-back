import { ArtistOrphansService } from './artist-orphans.service';

function queryBuilder(result: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoin', 'where', 'andWhere']) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getCount = jest.fn().mockResolvedValue(result.count ?? 0);
  qb.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  return qb;
}

describe('ArtistOrphansService', () => {
  const artistRepository = {
    createQueryBuilder: jest.fn(),
    remove: jest.fn(),
  };
  let service: ArtistOrphansService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArtistOrphansService(artistRepository as any);
  });

  it('counts artists without discs, national releases, or playlist associations using only query/review filters', async () => {
    const qb = queryBuilder({ count: 7 });
    artistRepository.createQueryBuilder.mockReturnValue(qb);

    await expect(service.countForManagement('Björk + Co', false)).resolves.toBe(7);
    expect(qb.leftJoin).toHaveBeenCalledWith('artist.disc', 'disc');
    expect(qb.where).toHaveBeenCalledWith('disc.id IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('national_release'),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (SELECT 1 FROM riff_valley_playlist_artists spa WHERE spa.artist_id = artist.id)',
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'artist.name_normalized LIKE :q', { q: '%bjork co%' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'artist.needsReview = :needsReview', { needsReview: false },
    );
    expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('genreId'), expect.anything());
  });

  it('does not add optional filters when query and needsReview are absent', async () => {
    const qb = queryBuilder({ count: 0 });
    artistRepository.createQueryBuilder.mockReturnValue(qb);

    await expect(service.countForManagement()).resolves.toBe(0);
    expect(qb.andWhere).toHaveBeenCalledTimes(2);
  });

  it('returns an empty result without removal when no orphan candidates exist', async () => {
    const qb = queryBuilder({ many: [] });
    artistRepository.createQueryBuilder.mockReturnValue(qb);

    await expect(service.removeOrphanArtists()).resolves.toEqual({ deleted: 0, artists: [] });
    expect(artistRepository.remove).not.toHaveBeenCalled();
  });

  it('removes orphan entities and returns their names in repository order', async () => {
    const orphans = [{ id: '2', name: 'B' }, { id: '1', name: 'A' }];
    const qb = queryBuilder({ many: orphans });
    artistRepository.createQueryBuilder.mockReturnValue(qb);
    artistRepository.remove.mockResolvedValue(orphans);

    await expect(service.removeOrphanArtists()).resolves.toEqual({
      deleted: 2, artists: ['B', 'A'],
    });
    expect(artistRepository.remove).toHaveBeenCalledTimes(1);
    expect(artistRepository.remove).toHaveBeenCalledWith(orphans);
  });
});
