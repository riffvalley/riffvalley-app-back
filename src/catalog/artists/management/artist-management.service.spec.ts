import { ArtistManagementService } from './artist-management.service';

const chainMethods = [
  'leftJoinAndSelect', 'leftJoin', 'innerJoinAndSelect', 'orderBy', 'take',
  'skip', 'where', 'andWhere', 'addSelect',
] as const;

function queryBuilder(result: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of chainMethods) qb[method] = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  qb.getCount = jest.fn().mockResolvedValue(result.count ?? 0);
  qb.getRawAndEntities = jest.fn().mockResolvedValue(
    result.rawAndEntities ?? { raw: [], entities: [] },
  );
  return qb;
}

describe('ArtistManagementService', () => {
  const artistRepository = { createQueryBuilder: jest.fn() };
  const discRepository = { createQueryBuilder: jest.fn() };
  const nationalReleaseRepository = { createQueryBuilder: jest.fn() };
  const playlistArtistRepository = { createQueryBuilder: jest.fn() };
  const artistOrphansService = { countForManagement: jest.fn() };
  let service: ArtistManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArtistManagementService(
      artistRepository as any,
      discRepository as any,
      nationalReleaseRepository as any,
      playlistArtistRepository as any,
      artistOrphansService as any,
    );
  });

  it('preserves query, genre and review filtering, pagination, and the empty-page orphanCount=0 behavior', async () => {
    const dataQb = queryBuilder({ many: [] });
    const countQb = queryBuilder({ count: 9 });
    artistRepository.createQueryBuilder
      .mockReturnValueOnce(dataQb)
      .mockReturnValueOnce(countQb);
    artistOrphansService.countForManagement.mockResolvedValue(4);

    await expect(
      service.findAllForManagement('Björk + Co', 5, 10, 'genre-id', false),
    ).resolves.toEqual({
      totalItems: 0, totalPages: 0, currentPage: 1, limit: 5, orphanCount: 0, data: [],
    });
    expect(dataQb.leftJoinAndSelect).toHaveBeenCalledWith('artist.country', 'country');
    expect(dataQb.orderBy).toHaveBeenCalledWith('artist.updatedAt', 'DESC');
    expect(dataQb.take).toHaveBeenCalledWith(5);
    expect(dataQb.skip).toHaveBeenCalledWith(10);
    expect(dataQb.where).toHaveBeenCalledWith(
      'artist.name_normalized LIKE :q', { q: '%bjork co%' },
    );
    expect(countQb.where).toHaveBeenCalledWith(
      'artist.name_normalized LIKE :q', { q: '%bjork co%' },
    );
    expect(dataQb.andWhere).toHaveBeenCalledWith(expect.any(Function), { genreId: 'genre-id' });
    expect(countQb.andWhere).toHaveBeenCalledWith(expect.any(Function), { genreId: 'genre-id' });
    expect(dataQb.andWhere).toHaveBeenCalledWith(
      'artist.needsReview = :needsReview', { needsReview: false },
    );
    expect(countQb.andWhere).toHaveBeenCalledWith(
      'artist.needsReview = :needsReview', { needsReview: false },
    );
    expect(artistOrphansService.countForManagement).toHaveBeenCalledTimes(1);
    // genreId remains absent from the orphan count, as in the original query.
    expect(artistOrphansService.countForManagement).toHaveBeenCalledWith('Björk + Co', false);
    expect(discRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps the management response projection, ordering, and related records unchanged', async () => {
    const artist = {
      id: 'artist-id', name: 'Artist', description: 'Bio', image: 'artist.jpg',
      country: { id: 'country-id', name: 'Country' },
    };
    const dataQb = queryBuilder({ many: [artist] });
    const countQb = queryBuilder({ count: 1 });
    artistRepository.createQueryBuilder
      .mockReturnValueOnce(dataQb)
      .mockReturnValueOnce(countQb);
    artistOrphansService.countForManagement.mockResolvedValue(2);

    const discQb = queryBuilder({ rawAndEntities: {
      entities: [{
        id: 'disc-id', name: 'Album', releaseDate: '2020-01-01', ep: false, debut: true,
        image: 'album.jpg', link: 'album-link', artist: { id: 'artist-id' },
        genre: { id: 'genre-id', name: 'Metal', color: '#111' },
      }],
      raw: [{ rateCount: '3', averageRate: '4.5' }],
    } });
    discRepository.createQueryBuilder.mockReturnValue(discQb);
    const releasesQb = queryBuilder({ many: [{
      id: 'release-id', artistName: 'ARTIST', discName: 'Single', discType: 'single',
      genre: 'Rock', releaseDay: '2024-02-01', approved: true,
      link: 'release-link', discId: 'disc-id',
    }] });
    nationalReleaseRepository.createQueryBuilder.mockReturnValue(releasesQb);
    const playlistQb = queryBuilder({ many: [{
      artistId: 'artist-id', spotify: {
        id: 'playlist-id', name: 'Playlist', link: 'playlist-link',
        type: 'album', imageUrl: 'playlist.jpg',
      },
    }] });
    playlistArtistRepository.createQueryBuilder.mockReturnValue(playlistQb);

    await expect(service.findAllForManagement()).resolves.toEqual({
      totalItems: 1, totalPages: 1, currentPage: 1, limit: 15, orphanCount: 2,
      data: [{
        id: 'artist-id', name: 'Artist', description: 'Bio', image: 'artist.jpg',
        country: artist.country,
        discs: [{
          id: 'disc-id', name: 'Album', releaseDate: '2020-01-01', ep: false, debut: true,
          image: 'album.jpg', link: 'album-link',
          genre: { id: 'genre-id', name: 'Metal', color: '#111' },
          rateCount: 3, averageRate: 4.5,
        }],
        nationalReleases: [{
          id: 'release-id', discName: 'Single', discType: 'single', genre: 'Rock',
          releaseDay: '2024-02-01', approved: true, link: 'release-link', discId: 'disc-id',
        }],
        spotifyPlaylists: [{
          id: 'playlist-id', name: 'Playlist', link: 'playlist-link',
          type: 'album', imageUrl: 'playlist.jpg',
        }],
      }],
    });
    expect(discQb.leftJoinAndSelect).toHaveBeenCalledWith('disc.genre', 'genre');
    expect(discQb.leftJoinAndSelect).toHaveBeenCalledWith('disc.artist', 'discArtist');
    expect(discQb.orderBy).toHaveBeenCalledWith('disc.releaseDate', 'DESC');
    expect(releasesQb.orderBy).toHaveBeenCalledWith('nr.releaseDay', 'DESC');
    expect(playlistQb.orderBy).toHaveBeenCalledWith('playlist.name', 'ASC');
  });
});
