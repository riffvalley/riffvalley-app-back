import { SpotifyService } from './spotify.service';

describe('SpotifyService', () => {
  it('incluye el número de artistas sin cargar la relación completa', async () => {
    const playlists = [
      { id: 'playlist-id', name: 'Festival', playlistArtistsCount: 3 },
    ];
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(playlists),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const service = new SpotifyService(repository as any, {} as any);

    await expect(
      service.findAll({ type: 'festival', limit: 50 }),
    ).resolves.toEqual(playlists);
    expect(query.loadRelationCountAndMap).toHaveBeenCalledWith(
      'spotify.playlistArtistsCount',
      'spotify.playlistArtists',
    );
    expect(query.andWhere).toHaveBeenCalledWith('spotify.type = :type', {
      type: 'festival',
    });
  });
});
