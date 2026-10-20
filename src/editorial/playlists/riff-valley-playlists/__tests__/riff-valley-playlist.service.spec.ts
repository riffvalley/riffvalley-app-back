import {
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from '../entities/riff-valley-playlist.entity';
import { RiffValleyPlaylistService } from '../riff-valley-playlist.service';
import { NotFoundException } from '@nestjs/common';

const unusedUserRepository = { findOneBy: jest.fn() };

describe('RiffValleyPlaylistService', () => {
  const validCreateDto = {
    name: 'Playlist',
    status: RiffValleyPlaylistStatus.EDITING,
    link: 'https://open.spotify.com/playlist/playlist-id',
    type: RiffValleyPlaylistType.GENERO,
    updateDate: '2026-08-20T10:00:00.000Z',
    userId: 'user-id',
  };

  it('valida el usuario antes de crear y responde 404 si no existe', async () => {
    const repository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const userRepository = { findOneBy: jest.fn().mockResolvedValue(null) };
    const service = new RiffValleyPlaylistService(
      repository as any,
      {} as any,
      userRepository as any,
    );

    await expect(service.create(validCreateDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 'user-id' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('crea la playlist cuando el usuario opcional existe', async () => {
    const user = { id: 'user-id' };
    const entity = { id: 'playlist-id' };
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
      findOne: jest.fn().mockResolvedValue(entity),
    };
    const userRepository = { findOneBy: jest.fn().mockResolvedValue(user) };
    const service = new RiffValleyPlaylistService(
      repository as any,
      {} as any,
      userRepository as any,
    );

    await expect(service.create(validCreateDto)).resolves.toBe(entity);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...validCreateDto,
        updateDate: new Date(validCreateDto.updateDate),
        user,
      }),
    );
    expect(repository.save).toHaveBeenCalledWith(entity);
  });

  it('valida el usuario antes de guardar una actualización', async () => {
    const playlist = { id: 'playlist-id', user: { id: 'previous-user' } };
    const repository = {
      findOne: jest.fn().mockResolvedValue(playlist),
      save: jest.fn(),
    };
    const userRepository = { findOneBy: jest.fn().mockResolvedValue(null) };
    const service = new RiffValleyPlaylistService(
      repository as any,
      {} as any,
      userRepository as any,
    );

    await expect(
      service.update('playlist-id', { userId: 'missing-user' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(userRepository.findOneBy).toHaveBeenCalledWith({
      id: 'missing-user',
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('actualiza la relación cuando el usuario existe', async () => {
    const user = { id: 'new-user' };
    const playlist = { id: 'playlist-id', user: { id: 'previous-user' } };
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, user }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const userRepository = { findOneBy: jest.fn().mockResolvedValue(user) };
    const service = new RiffValleyPlaylistService(
      repository as any,
      {} as any,
      userRepository as any,
    );

    await service.update('playlist-id', { userId: 'new-user' });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ user }),
    );
  });

  it('conserva user, content y el recuento de artistas en el listado', async () => {
    const playlists = [
      {
        id: 'playlist-id',
        name: 'Festival',
        user: { id: 'user-id' },
        content: { id: 'content-id' },
        playlistArtistsCount: 3,
      },
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
    const service = new RiffValleyPlaylistService(
      repository as any,
      {} as any,
      unusedUserRepository as any,
    );

    await expect(
      service.findAll({ type: 'festival', limit: 50 }),
    ).resolves.toEqual(playlists);
    expect(query.loadRelationCountAndMap).toHaveBeenCalledWith(
      'riffValleyPlaylist.playlistArtistsCount',
      'riffValleyPlaylist.playlistArtists',
    );
    expect(query.leftJoinAndSelect).toHaveBeenCalledWith(
      'riffValleyPlaylist.content',
      'content',
    );
    expect(query.leftJoinAndSelect).toHaveBeenCalledWith(
      'riffValleyPlaylist.user',
      'user',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'riffValleyPlaylist.type = :type',
      {
        type: 'festival',
      },
    );
  });

  // RiffValleyPlaylist y Content son independientes: cambiar el estado de una playlist
  // nunca debe crear, actualizar ni borrar el Content asociado. Sincronizar
  // el Content es ahora una acción manual explícita
  // (ContentsService.syncMediaStatus() / POST /contents/:id/sync-media).
  it('no toca Content al pasar una playlist a READY (solo exige usuario asignado)', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.EDITING,
      user: { id: 'user-id' },
    };
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({
          ...playlist,
          status: RiffValleyPlaylistStatus.READY,
        }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const contentsService = {
      findOneByRiffValleyPlaylistId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
    );

    await service.update('playlist-id', {
      status: RiffValleyPlaylistStatus.READY,
    });

    expect(contentsService.create).not.toHaveBeenCalled();
    expect(contentsService.update).not.toHaveBeenCalled();
    expect(contentsService.remove).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: RiffValleyPlaylistStatus.READY }),
    );
  });

  it('exige un usuario asignado para pasar a READY', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist sin usuario',
      status: RiffValleyPlaylistStatus.EDITING,
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
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
    );

    await expect(
      service.update('playlist-id', { status: RiffValleyPlaylistStatus.READY }),
    ).rejects.toThrow('debe tener un usuario asignado');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    RiffValleyPlaylistStatus.NOT_STARTED,
    RiffValleyPlaylistStatus.IN_PROGRESS,
    RiffValleyPlaylistStatus.EDITING,
  ])('no toca Content al retroceder una playlist a %s', async (status) => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.READY,
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
      findOneByRiffValleyPlaylistId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
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
      status: RiffValleyPlaylistStatus.READY,
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
      findOneByRiffValleyPlaylistId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
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
      status: RiffValleyPlaylistStatus.READY,
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
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
    );

    await expect(
      service.update('playlist-id', {
        status: RiffValleyPlaylistStatus.PUBLISHED,
      }),
    ).rejects.toThrow('debe proporcionar una fecha');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('createContentForRiffValleyPlaylist crea un Content en backlog y lo enlaza', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.EDITING,
      user: { id: 'user-id' },
      content: null,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(playlist),
    };
    const contentsService = {
      create: jest.fn().mockResolvedValue({ id: 'content-id' }),
    };
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
    );

    await service.createContentForRiffValleyPlaylist('playlist-id');

    expect(contentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Playlist terminada',
        authorId: 'user-id',
        riffValleyPlaylistId: 'playlist-id',
        backlog: true,
      }),
    );
  });

  it('createContentForRiffValleyPlaylist falla si ya hay un Content asociado', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.EDITING,
      user: { id: 'user-id' },
      content: { id: 'content-id' },
    };
    const repository = { findOne: jest.fn().mockResolvedValue(playlist) };
    const contentsService = { create: jest.fn() };
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
    );

    await expect(
      service.createContentForRiffValleyPlaylist('playlist-id'),
    ).rejects.toThrow('ya tiene un Content asociado');
    expect(contentsService.create).not.toHaveBeenCalled();
  });

  it('createContentForRiffValleyPlaylist falla si no hay usuario asignado', async () => {
    const playlist = {
      id: 'playlist-id',
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.EDITING,
      user: null,
      content: null,
    };
    const repository = { findOne: jest.fn().mockResolvedValue(playlist) };
    const contentsService = { create: jest.fn() };
    const service = new RiffValleyPlaylistService(
      repository as any,
      contentsService as any,
      unusedUserRepository as any,
    );

    await expect(
      service.createContentForRiffValleyPlaylist('playlist-id'),
    ).rejects.toThrow('debe tener un usuario asignado');
    expect(contentsService.create).not.toHaveBeenCalled();
  });
});
