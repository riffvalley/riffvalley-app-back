import { NotFoundException } from '@nestjs/common';
import { ArtistDetailsService } from './artist-details.service';

const chainMethods = ['leftJoinAndSelect', 'orderBy', 'where', 'addSelect'] as const;

function queryBuilder(result: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of chainMethods) qb[method] = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.from = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  qb.getRawAndEntities = jest.fn().mockResolvedValue(
    result.rawAndEntities ?? { raw: [], entities: [] },
  );
  return qb;
}

describe('ArtistDetailsService', () => {
  const artistRepository = { findOne: jest.fn() };
  const discRepository = { createQueryBuilder: jest.fn() };
  const nationalReleaseRepository = { createQueryBuilder: jest.fn() };
  let service: ArtistDetailsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArtistDetailsService(
      artistRepository as any,
      discRepository as any,
      nationalReleaseRepository as any,
    );
  });

  it('returns 404 for a missing Artist and skips related queries', async () => {
    artistRepository.findOne.mockResolvedValue(null);

    await expect(service.findOneWithDetails('missing')).rejects.toMatchObject({
      constructor: NotFoundException, message: 'Artist with id missing not found',
    });
    expect(artistRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'missing' }, relations: ['country'],
    });
    expect(discRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns the detail projection with Country, ordered Discs and NationalRelease rows', async () => {
    artistRepository.findOne.mockResolvedValue({
      id: 'artist-id', name: 'Artist', description: null, image: null,
      country: undefined,
    });
    const discsQb = queryBuilder({ rawAndEntities: {
      entities: [{
        id: 'disc-id', name: 'Album', releaseDate: '2020-01-01', ep: false, debut: true,
        image: 'cover', link: 'disc-link',
        genre: { id: 'genre-id', name: 'Metal', color: '#222' },
      }],
      raw: [{ rateCount: '2', averageRate: '3.25' }],
    } });
    discRepository.createQueryBuilder.mockReturnValue(discsQb);
    const releasesQb = queryBuilder({ many: [{
      id: 'release-id', discName: 'Single', discType: 'single', genre: 'Rock',
      releaseDay: '2025-01-01', approved: false, link: 'release-link', discId: null,
    }] });
    nationalReleaseRepository.createQueryBuilder.mockReturnValue(releasesQb);

    await expect(service.findOneWithDetails('artist-id')).resolves.toEqual({
      id: 'artist-id', name: 'Artist', description: null, image: null,
      country: null,
      discs: [{
        id: 'disc-id', name: 'Album', releaseDate: '2020-01-01', ep: false, debut: true,
        image: 'cover', link: 'disc-link',
        genre: { id: 'genre-id', name: 'Metal', color: '#222' },
        rateCount: 2, averageRate: 3.25,
      }],
      nationalReleases: [{
        id: 'release-id', discName: 'Single', discType: 'single', genre: 'Rock',
        releaseDay: '2025-01-01', approved: false, link: 'release-link', discId: null,
      }],
    });
    expect(discsQb.where).toHaveBeenCalledWith('disc.artistId = :id', { id: 'artist-id' });
    expect(discsQb.orderBy).toHaveBeenCalledWith('disc.releaseDate', 'DESC');
    expect(releasesQb.where).toHaveBeenCalledWith(
      'LOWER(nr.artistName) = LOWER(:name)', { name: 'Artist' },
    );
    expect(releasesQb.orderBy).toHaveBeenCalledWith('nr.releaseDay', 'DESC');
  });
});
