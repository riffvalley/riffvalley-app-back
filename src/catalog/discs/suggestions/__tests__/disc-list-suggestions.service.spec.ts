import { Artist } from '../../../artists/entities/artist.entity';
import { Disc } from '../../entities/disc.entity';
import {
  DiscListSuggestionsService,
  MusicSuggestionQueryBuilder,
  MusicSuggestionQueryRepository,
} from '../disc-list-suggestions.service';

function queryBuilderMock<Entity, Row>(rows: Row[]) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  } satisfies MusicSuggestionQueryBuilder<Entity>;
  return builder;
}

describe('DiscListSuggestionsService', () => {
  const artistRows = [
    { id: 'artist-1', name: 'MØL', image: null },
    { id: 'artist-2', name: 'MOL', image: 'artist.jpg' },
  ];
  const discRows = [
    {
      id: 'disc-1',
      title: 'Jord',
      artistId: 'artist-1',
      artistName: 'MØL',
      image: null,
    },
  ];

  it('returns an empty response without querying when normalized input is too short', async () => {
    const artistQuery = queryBuilderMock<Artist, (typeof artistRows)[number]>(
      artistRows,
    );
    const discQuery = queryBuilderMock<Disc, (typeof discRows)[number]>(
      discRows,
    );
    const artistRepository: MusicSuggestionQueryRepository<Artist> = {
      createQueryBuilder: jest.fn().mockReturnValue(artistQuery),
    };
    const discRepository: MusicSuggestionQueryRepository<Disc> = {
      createQueryBuilder: jest.fn().mockReturnValue(discQuery),
    };
    const service = new DiscListSuggestionsService(
      artistRepository,
      discRepository,
    );

    await expect(service.findSuggestions(' Ø ')).resolves.toEqual({
      artists: [],
      discs: [],
    });
    expect(artistRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(discRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('runs one bounded artist query and one joined disc query, independent of list pagination', async () => {
    const artistQuery = queryBuilderMock<Artist, (typeof artistRows)[number]>(
      artistRows,
    );
    const discQuery = queryBuilderMock<Disc, (typeof discRows)[number]>(
      discRows,
    );
    const artistRepository: MusicSuggestionQueryRepository<Artist> = {
      createQueryBuilder: jest.fn().mockReturnValue(artistQuery),
    };
    const discRepository: MusicSuggestionQueryRepository<Disc> = {
      createQueryBuilder: jest.fn().mockReturnValue(discQuery),
    };
    const service = new DiscListSuggestionsService(
      artistRepository,
      discRepository,
    );

    await expect(service.findSuggestions('mol')).resolves.toEqual({
      artists: artistRows,
      discs: discRows,
    });

    expect(artistQuery.take).toHaveBeenCalledWith(3);
    expect(discQuery.take).toHaveBeenCalledWith(5);
    expect(artistQuery.orderBy).toHaveBeenCalledWith('suggestionRank', 'ASC');
    expect(artistQuery.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'artist.name',
      'ASC',
    );
    expect(artistQuery.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'artist.id',
      'ASC',
    );
    expect(discQuery.innerJoin).toHaveBeenCalledWith('disc.artist', 'artist');
    expect(discQuery.andWhere).toHaveBeenCalledWith(
      'disc.releaseDate <= :suggestionToday',
      expect.objectContaining({ suggestionToday: expect.any(Date) }),
    );
    expect(discQuery.addOrderBy).toHaveBeenNthCalledWith(3, 'disc.id', 'ASC');
    expect(artistQuery.getRawMany).toHaveBeenCalledTimes(1);
    expect(discQuery.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('uses escaped literal LIKE patterns for normalized and legacy Catalog keys', async () => {
    const artistQuery = queryBuilderMock<Artist, (typeof artistRows)[number]>(
      [],
    );
    const discQuery = queryBuilderMock<Disc, (typeof discRows)[number]>([]);
    const artistRepository: MusicSuggestionQueryRepository<Artist> = {
      createQueryBuilder: jest.fn().mockReturnValue(artistQuery),
    };
    const discRepository: MusicSuggestionQueryRepository<Disc> = {
      createQueryBuilder: jest.fn().mockReturnValue(discQuery),
    };
    const service = new DiscListSuggestionsService(
      artistRepository,
      discRepository,
    );

    await service.findSuggestions('s%t_');

    expect(artistQuery.where).toHaveBeenCalledWith(
      expect.stringContaining("ESCAPE '\\'"),
      expect.objectContaining({
        artistSuggestionSearchLegacy: '%s\\%t\\_%',
      }),
    );
    expect(discQuery.where).toHaveBeenCalledWith(
      expect.stringContaining("ESCAPE '\\'"),
      expect.objectContaining({
        discSuggestionSearchLegacy0: '%s\\%t\\_%',
        discSuggestionSearchLegacy1: '%s\\%t\\_%',
      }),
    );
  });
});
