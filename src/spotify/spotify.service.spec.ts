import { SpotifyStatus } from './entities/spotify.entity';
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

  it('crea un evento en el backlog cuando una playlist pasa a terminada', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.EDITING,
      user: { id: 'user-id' },
    };
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, status: SpotifyStatus.READY }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const contentsService = {
      findOneBySpotifyId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'content-id' }),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.update('playlist-id', { status: SpotifyStatus.READY });

    expect(contentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Playlist terminada',
        authorId: 'user-id',
        spotifyId: 'playlist-id',
        backlog: true,
      }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SpotifyStatus.READY }),
    );
  });

  it.each([
    SpotifyStatus.NOT_STARTED,
    SpotifyStatus.IN_PROGRESS,
    SpotifyStatus.EDITING,
  ])('elimina el evento cuando una playlist retrocede a %s', async (status) => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.READY,
      user: { id: 'user-id' },
    };
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, status }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const contentsService = {
      findOneBySpotifyId: jest
        .fn()
        .mockResolvedValue({ id: 'content-id' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.update('playlist-id', { status });

    expect(contentsService.remove).toHaveBeenCalledWith('content-id');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status }),
    );
  });

  it('saca el evento del backlog cuando se le asigna fecha', async () => {
    const updateDate = '2026-08-20T10:00:00.000Z';
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.READY,
      user: { id: 'user-id' },
    };
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, status: SpotifyStatus.PUBLISHED }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const contentsService = {
      findOneBySpotifyId: jest
        .fn()
        .mockResolvedValue({ id: 'content-id' }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.update('playlist-id', { updateDate });

    expect(contentsService.update).toHaveBeenCalledWith('content-id', {
      publicationDate: new Date(updateDate),
      backlog: false,
    });
  });
});
