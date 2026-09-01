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
    expect(query.leftJoinAndSelect).toHaveBeenCalledWith(
      'spotify.content',
      'content',
    );
    expect(query.andWhere).toHaveBeenCalledWith('spotify.type = :type', {
      type: 'festival',
    });
  });

  // Spotify y Content son independientes: cambiar el estado de una playlist
  // nunca debe crear, actualizar ni borrar el Content asociado. Sincronizar
  // el Content es ahora una acción manual explícita
  // (ContentsService.syncMediaStatus() / POST /contents/:id/sync-media).
  it('no toca Content al pasar una playlist a READY (solo exige usuario asignado)', async () => {
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
      findOneBySpotifyId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.update('playlist-id', { status: SpotifyStatus.READY });

    expect(contentsService.create).not.toHaveBeenCalled();
    expect(contentsService.update).not.toHaveBeenCalled();
    expect(contentsService.remove).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SpotifyStatus.READY }),
    );
  });

  it('exige un usuario asignado para pasar a READY', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist sin usuario',
      status: SpotifyStatus.EDITING,
      user: null,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(playlist),
      save: jest.fn(),
    };
    const contentsService = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await expect(
      service.update('playlist-id', { status: SpotifyStatus.READY }),
    ).rejects.toThrow('debe tener un usuario asignado');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    SpotifyStatus.NOT_STARTED,
    SpotifyStatus.IN_PROGRESS,
    SpotifyStatus.EDITING,
  ])('no toca Content al retroceder una playlist a %s', async (status) => {
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
      findOneBySpotifyId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.update('playlist-id', { status });

    expect(contentsService.remove).not.toHaveBeenCalled();
    expect(contentsService.create).not.toHaveBeenCalled();
    expect(contentsService.update).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status }),
    );
  });

  it('no toca Content al asignar fecha de actualización', async () => {
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
        .mockResolvedValue({ ...playlist, updateDate: new Date(updateDate) }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const contentsService = {
      findOneBySpotifyId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.update('playlist-id', { updateDate });

    expect(contentsService.update).not.toHaveBeenCalled();
    expect(contentsService.create).not.toHaveBeenCalled();
    expect(contentsService.remove).not.toHaveBeenCalled();
  });

  it('exige updateDate para pasar a PUBLISHED', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.READY,
      user: { id: 'user-id' },
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(playlist),
      save: jest.fn(),
    };
    const contentsService = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await expect(
      service.update('playlist-id', { status: SpotifyStatus.PUBLISHED }),
    ).rejects.toThrow('debe proporcionar una fecha');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('createContentForSpotify crea un Content en backlog y lo enlaza', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.EDITING,
      user: { id: 'user-id' },
      content: null,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(playlist),
    };
    const contentsService = {
      create: jest.fn().mockResolvedValue({ id: 'content-id' }),
    };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await service.createContentForSpotify('playlist-id');

    expect(contentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Playlist terminada',
        authorId: 'user-id',
        spotifyId: 'playlist-id',
        backlog: true,
      }),
    );
  });

  it('createContentForSpotify falla si ya hay un Content asociado', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.EDITING,
      user: { id: 'user-id' },
      content: { id: 'content-id' },
    };
    const repository = { findOne: jest.fn().mockResolvedValue(playlist) };
    const contentsService = { create: jest.fn() };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await expect(
      service.createContentForSpotify('playlist-id'),
    ).rejects.toThrow('ya tiene un Content asociado');
    expect(contentsService.create).not.toHaveBeenCalled();
  });

  it('createContentForSpotify falla si no hay usuario asignado', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: SpotifyStatus.EDITING,
      user: null,
      content: null,
    };
    const repository = { findOne: jest.fn().mockResolvedValue(playlist) };
    const contentsService = { create: jest.fn() };
    const service = new SpotifyService(
      repository as any,
      contentsService as any,
    );

    await expect(
      service.createContentForSpotify('playlist-id'),
    ).rejects.toThrow('debe tener un usuario asignado');
    expect(contentsService.create).not.toHaveBeenCalled();
  });
});
