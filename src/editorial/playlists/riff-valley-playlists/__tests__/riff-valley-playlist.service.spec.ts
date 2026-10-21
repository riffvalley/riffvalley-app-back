import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { User } from 'src/identity/auth/entities/user.entity';
import { CreateRiffValleyPlaylistDto } from '../dto/create-riff-valley-playlist.dto';
import { UpdateRiffValleyPlaylistDto } from '../dto/update-riff-valley-playlist.dto';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from '../entities/riff-valley-playlist.entity';
import { RiffValleyPlaylistService } from '../riff-valley-playlist.service';

type PlaylistRepositoryMock = jest.Mocked<
  Pick<
    Repository<RiffValleyPlaylist>,
    'create' | 'save' | 'findOne' | 'createQueryBuilder'
  >
>;
type UserRepositoryMock = jest.Mocked<Pick<Repository<User>, 'findOneBy'>>;
type ContentServiceMock = jest.Mocked<
  Pick<ContentsService, 'create' | 'update' | 'remove'>
>;
type PlaylistQueryMock = jest.Mocked<
  Pick<
    SelectQueryBuilder<RiffValleyPlaylist>,
    | 'leftJoinAndSelect'
    | 'loadRelationCountAndMap'
    | 'orderBy'
    | 'take'
    | 'skip'
    | 'andWhere'
    | 'getMany'
  >
>;

const makeUser = (id: string): User => Object.assign(new User(), { id });

const makePlaylist = (
  overrides: Partial<RiffValleyPlaylist> = {},
): RiffValleyPlaylist =>
  Object.assign(new RiffValleyPlaylist(), {
    id: 'playlist-id',
    name: 'Playlist',
    status: RiffValleyPlaylistStatus.EDITING,
    link: 'https://open.spotify.com/playlist/playlist-id',
    spotifyPlaylistId: null,
    description: null,
    isPublic: false,
    imageUrl: null,
    protectedTrackUris: [],
    type: RiffValleyPlaylistType.GENERO,
    updateDate: new Date('2026-08-20T10:00:00.000Z'),
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    content: null,
    user: null,
    playlistArtists: [],
    ...overrides,
  });

const createService = async (
  repository: PlaylistRepositoryMock,
  contentsService: ContentServiceMock,
  userRepository: UserRepositoryMock,
): Promise<RiffValleyPlaylistService> => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RiffValleyPlaylistService,
      { provide: getRepositoryToken(RiffValleyPlaylist), useValue: repository },
      { provide: ContentsService, useValue: contentsService },
      { provide: getRepositoryToken(User), useValue: userRepository },
    ],
  }).compile();

  return moduleRef.get(RiffValleyPlaylistService);
};

const unusedUserRepository: UserRepositoryMock = {
  findOneBy: jest.fn(),
};
const unusedContentsService: ContentServiceMock = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('RiffValleyPlaylistService', () => {
  const validCreateDto: CreateRiffValleyPlaylistDto = {
    name: 'Playlist',
    status: RiffValleyPlaylistStatus.EDITING,
    link: 'https://open.spotify.com/playlist/playlist-id',
    type: RiffValleyPlaylistType.GENERO,
    updateDate: '2026-08-20T10:00:00.000Z',
    userId: 'user-id',
  };

  it('valida el usuario antes de crear y responde 404 si no existe', async () => {
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const userRepository: UserRepositoryMock = {
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    const service = await createService(
      repository,
      unusedContentsService,
      userRepository,
    );

    await expect(service.create(validCreateDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 'user-id' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('crea la playlist cuando el usuario opcional existe', async () => {
    const user = makeUser('user-id');
    const entity = makePlaylist();
    const repository: PlaylistRepositoryMock = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
      findOne: jest.fn().mockResolvedValue(entity),
      createQueryBuilder: jest.fn(),
    };
    const userRepository: UserRepositoryMock = {
      findOneBy: jest.fn().mockResolvedValue(user),
    };
    const service = await createService(
      repository,
      unusedContentsService,
      userRepository,
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
    const playlist = makePlaylist({ user: makeUser('previous-user') });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(playlist),
      createQueryBuilder: jest.fn(),
    };
    const userRepository: UserRepositoryMock = {
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    const service = await createService(
      repository,
      unusedContentsService,
      userRepository,
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
    const user = makeUser('new-user');
    const playlist = makePlaylist({ user: makeUser('previous-user') });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(playlist),
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, user }),
      createQueryBuilder: jest.fn(),
    };
    const userRepository: UserRepositoryMock = {
      findOneBy: jest.fn().mockResolvedValue(user),
    };
    const service = await createService(
      repository,
      unusedContentsService,
      userRepository,
    );

    const updateDto: UpdateRiffValleyPlaylistDto = { userId: 'new-user' };
    await service.update('playlist-id', updateDto);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ user }),
    );
  });

  it('conserva user, content y el recuento de artistas en el listado', async () => {
    const playlists = [
      makePlaylist({
        name: 'Festival',
        user: makeUser('user-id'),
        content: Object.assign(new Content(), { id: 'content-id' }),
        playlistArtistsCount: 3,
      }),
    ];
    const query: PlaylistQueryMock = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(playlists),
    };
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const service = await createService(
      repository,
      unusedContentsService,
      unusedUserRepository,
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
      { type: 'festival' },
    );
  });

  // RiffValleyPlaylist y Content son independientes: cambiar el estado de una playlist
  // nunca debe crear, actualizar ni borrar el Content asociado. Sincronizar
  // el Content es ahora una acción manual explícita
  // (ContentsService.syncMediaStatus() / POST /contents/:id/sync-media).
  it('no toca Content al pasar una playlist a READY (solo exige usuario asignado)', async () => {
    const playlist = makePlaylist({
      name: 'Playlist terminada',
      user: makeUser('user-id'),
    });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(playlist),
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({
          ...playlist,
          status: RiffValleyPlaylistStatus.READY,
        }),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
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
    const playlist = makePlaylist({ name: 'Playlist sin usuario' });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(playlist),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
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
    const playlist = makePlaylist({
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.READY,
      user: makeUser('user-id'),
    });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(playlist),
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, status }),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
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
    const playlist = makePlaylist({
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.READY,
      user: makeUser('user-id'),
    });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(playlist),
      findOne: jest
        .fn()
        .mockResolvedValueOnce(playlist)
        .mockResolvedValue({ ...playlist, updateDate: new Date(updateDate) }),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
    );

    await service.update('playlist-id', { updateDate });

    expect(contentsService.update).not.toHaveBeenCalled();
    expect(contentsService.create).not.toHaveBeenCalled();
    expect(contentsService.remove).not.toHaveBeenCalled();
  });

  it('exige updateDate para pasar a PUBLISHED', async () => {
    const playlist = makePlaylist({
      name: 'Playlist terminada',
      status: RiffValleyPlaylistStatus.READY,
      user: makeUser('user-id'),
    });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(playlist),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
    );

    await expect(
      service.update('playlist-id', {
        status: RiffValleyPlaylistStatus.PUBLISHED,
      }),
    ).rejects.toThrow('debe proporcionar una fecha');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('createContentForRiffValleyPlaylist crea un Content en backlog y lo enlaza', async () => {
    const playlist = makePlaylist({
      name: 'Playlist terminada',
      user: makeUser('user-id'),
    });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(playlist),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn().mockResolvedValue(new Content()),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
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
    const playlist = makePlaylist({
      name: 'Playlist terminada',
      content: Object.assign(new Content(), { id: 'content-id' }),
      user: makeUser('user-id'),
    });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(playlist),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
    );

    await expect(
      service.createContentForRiffValleyPlaylist('playlist-id'),
    ).rejects.toThrow('ya tiene un Content asociado');
    expect(contentsService.create).not.toHaveBeenCalled();
  });

  it('createContentForRiffValleyPlaylist falla si no hay usuario asignado', async () => {
    const playlist = makePlaylist({ name: 'Playlist terminada' });
    const repository: PlaylistRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(playlist),
      createQueryBuilder: jest.fn(),
    };
    const contentsService: ContentServiceMock = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = await createService(
      repository,
      contentsService,
      unusedUserRepository,
    );

    await expect(
      service.createContentForRiffValleyPlaylist('playlist-id'),
    ).rejects.toThrow('debe tener un usuario asignado');
    expect(contentsService.create).not.toHaveBeenCalled();
  });
});
