import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { User } from 'src/identity/auth/entities/user.entity';
import { UpdateRiffValleyPlaylistDto } from '../dto/update-riff-valley-playlist.dto';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from '../entities/riff-valley-playlist.entity';
import { RiffValleyPlaylistService } from '../riff-valley-playlist.service';

type PlaylistUpdateCase = {
  label: string;
  update: UpdateRiffValleyPlaylistDto;
  errorMessage: string;
};

describe('RiffValleyPlaylistService editorial consistency', () => {
  const linkedPlaylist = (): RiffValleyPlaylist =>
    Object.assign(new RiffValleyPlaylist(), {
      id: 'playlist-id',
      name: 'Playlist actual',
      link: 'https://open.spotify.com/playlist/playlist-id',
      spotifyPlaylistId: 'playlist-id',
      type: RiffValleyPlaylistType.GENERO,
      status: RiffValleyPlaylistStatus.EDITING,
      updateDate: new Date('2026-08-20T10:00:00.000Z'),
      user: null,
      content: null,
    });

  const createService = async (playlist: RiffValleyPlaylist) => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(playlist),
      save: jest.fn().mockResolvedValue(playlist),
    };
    const userRepository = { findOneBy: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RiffValleyPlaylistService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: repository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: ContentsService, useValue: {} },
      ],
    }).compile();

    return {
      service: moduleRef.get(RiffValleyPlaylistService),
      repository,
      userRepository,
    };
  };

  it.each<PlaylistUpdateCase>([
    {
      label: 'nombre',
      update: { name: 'Nombre nuevo' },
      errorMessage: 'renombre sincronizado',
    },
    {
      label: 'enlace',
      update: { link: 'https://open.spotify.com/playlist/otro-id' },
      errorMessage: 'No se puede cambiar el enlace',
    },
  ])(
    'rechaza el cambio de $label vinculado antes de guardar',
    async ({ update, errorMessage }) => {
      const { service, repository } = await createService(linkedPlaylist());

      await expect(service.update('playlist-id', update)).rejects.toThrow(
        errorMessage,
      );
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('permite repetir el nombre y el enlace actuales de una playlist vinculada', async () => {
    const playlist = linkedPlaylist();
    const { service, repository } = await createService(playlist);

    await service.update('playlist-id', {
      name: playlist.name,
      link: playlist.link,
    });

    expect(repository.save).toHaveBeenCalledWith(playlist);
  });

  it('permite cambios editoriales locales sin requerir Spotify', async () => {
    const playlist = linkedPlaylist();
    const { service, repository, userRepository } =
      await createService(playlist);
    const date = '2026-09-01T12:30:00.000Z';

    await service.update('playlist-id', {
      status: RiffValleyPlaylistStatus.IN_PROGRESS,
      updateDate: date,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Playlist actual',
        link: 'https://open.spotify.com/playlist/playlist-id',
        spotifyPlaylistId: 'playlist-id',
        status: RiffValleyPlaylistStatus.IN_PROGRESS,
        updateDate: new Date(date),
      }),
    );
    expect(userRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('mantiene sin cambios los campos vinculados omitidos en un PATCH editorial', async () => {
    const playlist = linkedPlaylist();
    const { service, repository } = await createService(playlist);

    await service.update('playlist-id', {
      status: RiffValleyPlaylistStatus.NOT_STARTED,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Playlist actual',
        link: 'https://open.spotify.com/playlist/playlist-id',
        spotifyPlaylistId: 'playlist-id',
      }),
    );
  });

  it('permite cambiar nombre, enlace y tipo de una playlist no vinculada', async () => {
    const playlist = Object.assign(linkedPlaylist(), {
      spotifyPlaylistId: null,
    });
    const { service, repository } = await createService(playlist);

    await service.update('playlist-id', {
      name: 'Nombre editorial',
      link: 'https://example.com/playlist',
      type: RiffValleyPlaylistType.FESTIVAL,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nombre editorial',
        link: 'https://example.com/playlist',
        type: RiffValleyPlaylistType.FESTIVAL,
        spotifyPlaylistId: null,
      }),
    );
  });

  it('permite cambios de tipo dentro de la familia de géneros vinculada', async () => {
    const playlist = linkedPlaylist();
    const { service, repository } = await createService(playlist);

    await service.update('playlist-id', {
      type: RiffValleyPlaylistType.ESPECIAL,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: RiffValleyPlaylistType.ESPECIAL }),
    );
  });

  it.each([
    [RiffValleyPlaylistType.FESTIVAL, RiffValleyPlaylistType.GENERO],
    [RiffValleyPlaylistType.GENERO, RiffValleyPlaylistType.FESTIVAL],
  ])(
    'rechaza el cruce vinculado de tipo %s a %s antes de guardar',
    async (currentType, nextType) => {
      const playlist = Object.assign(linkedPlaylist(), { type: currentType });
      const { service, repository } = await createService(playlist);

      await expect(
        service.update('playlist-id', { type: nextType }),
      ).rejects.toThrow('entre festival y género');
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
});
