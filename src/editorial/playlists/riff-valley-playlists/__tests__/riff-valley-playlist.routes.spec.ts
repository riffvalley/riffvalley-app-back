import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { User } from 'src/identity/auth/entities/user.entity';
import { UsersService } from 'src/identity/users/users.service';
import { JwtStrategy } from 'src/identity/auth/strategies/jwt.strategy';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { RiffValleyPlaylistController } from '../riff-valley-playlist.controller';
import { RiffValleyPlaylistService } from '../riff-valley-playlist.service';

describe('RiffValleyPlaylist Nest HTTP routes', () => {
  let app;
  let moduleRef: TestingModule;
  let accessToken: string;
  const testUser = {
    id: '83f59390-5ca1-4331-90c2-3b54ca17e123',
    username: 'riff-valley-test',
    isActive: true,
    role: ValidRoles.riffvalley,
  };
  const usersService = {
    findById: jest.fn(),
    findIdentityById: jest.fn(),
  };
  const service = {
    findAll: jest.fn(),
    findRandomGenrePlaylist: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createContentForRiffValleyPlaylist: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    usersService.findById.mockResolvedValue(
      Object.assign(new User(), testUser),
    );
    usersService.findIdentityById.mockResolvedValue({
      id: testUser.id,
      role: testUser.role,
      isActive: true,
    });
    moduleRef = await Test.createTestingModule({
      controllers: [RiffValleyPlaylistController],
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'riff-valley-routes-test-secret' }),
      ],
      providers: [
        { provide: RiffValleyPlaylistService, useValue: service },
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: { get: () => 'riff-valley-routes-test-secret' },
        },
        JwtStrategy,
        UserRoleGuard,
      ],
    }).compile();
    const jwtService = moduleRef.get(JwtService);
    accessToken = await jwtService.signAsync({
      id: testUser.id,
      username: testUser.username,
      role: testUser.role,
    });
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('keeps the linked Content identity while omitting editorial planning fields', async () => {
    const playlist = {
      id: 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783',
      name: 'Festival',
      user: { id: testUser.id },
      content: {
        id: 'content-id',
        name: 'Unpublished plan',
        notes: 'Internal notes',
        publicationDate: '2026-10-30T00:00:00.000Z',
        closeDate: '2026-11-01T00:00:00.000Z',
        ready: true,
        backlog: true,
        author: { id: 'author-id' },
      },
      playlistArtistsCount: 3,
    };
    service.findAll.mockResolvedValue([playlist]);

    await request(app.getHttpServer())
      .get('/api/riff-valley-playlists')
      .expect(200, [
        {
          ...playlist,
          content: { id: 'content-id' },
        },
      ]);
  });

  it('rejects an expired JWT before invoking a protected handler', async () => {
    const expiredToken = await moduleRef.get(JwtService).signAsync(
      {
        id: testUser.id,
        username: testUser.username,
        role: testUser.role,
      },
      { expiresIn: '-1s' },
    );

    await request(app.getHttpServer())
      .post('/api/riff-valley-playlists')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ name: 'Expired token' })
      .expect(401);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('routes lists, festival/genre filters, and random genre lookup', async () => {
    service.findAll.mockResolvedValue([]);
    service.findRandomGenrePlaylist.mockResolvedValue({ id: 'playlist-id' });

    await request(app.getHttpServer())
      .get('/api/riff-valley-playlists')
      .query({ q: 'metal', limit: '10' })
      .expect(200, []);
    expect(service.findAll).toHaveBeenLastCalledWith({ q: 'metal', limit: 10 });

    await request(app.getHttpServer())
      .get('/api/riff-valley-playlists/festivals')
      .expect(200, []);
    expect(service.findAll).toHaveBeenLastCalledWith({ type: 'festival' });

    await request(app.getHttpServer())
      .get('/api/riff-valley-playlists/genres')
      .expect(200, []);
    expect(service.findAll).toHaveBeenLastCalledWith({
      type: ['genero', 'especial', 'otras'],
    });

    await request(app.getHttpServer())
      .get('/api/riff-valley-playlists/genres/random')
      .expect(200, { id: 'playlist-id' });
    expect(service.findRandomGenrePlaylist).toHaveBeenCalledTimes(1);
  });

  it('routes create, detail, update, delete, and associated Content', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const createDto = {
      name: 'Playlist',
      status: 'ready',
      link: 'https://open.spotify.com/playlist/playlist-id',
      type: 'festival',
      updateDate: '2026-10-05T00:00:00.000Z',
    };
    service.create.mockResolvedValue({ id, ...createDto });
    service.findOne.mockResolvedValue({ id, name: 'Playlist' });
    service.update.mockResolvedValue({ id, name: 'Updated' });
    service.remove.mockResolvedValue({ message: 'removed' });
    service.createContentForRiffValleyPlaylist.mockResolvedValue({
      id: 'content-id',
      riffValleyPlaylistId: id,
    });

    await request(app.getHttpServer())
      .post('/api/riff-valley-playlists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createDto)
      .expect(201, { id, ...createDto });
    expect(service.create).toHaveBeenCalledWith(createDto);

    await request(app.getHttpServer())
      .get(`/api/riff-valley-playlists/${id}`)
      .expect(200, { id, name: 'Playlist' });
    expect(service.findOne).toHaveBeenCalledWith(id);

    await request(app.getHttpServer())
      .patch(`/api/riff-valley-playlists/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated' })
      .expect(200, { id, name: 'Updated' });
    expect(service.update).toHaveBeenCalledWith(id, { name: 'Updated' });

    await request(app.getHttpServer())
      .delete(`/api/riff-valley-playlists/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, { message: 'removed' });
    expect(service.remove).toHaveBeenCalledWith(id);

    await request(app.getHttpServer())
      .post(`/api/riff-valley-playlists/${id}/content`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Content-Calendar-Client-Id', 'calendar-tab-1')
      .expect(201, { id: 'content-id', riffValleyPlaylistId: id });
    expect(service.createContentForRiffValleyPlaylist).toHaveBeenCalledWith(
      id,
      {
        actor: {
          kind: 'user',
          id: testUser.id,
          displayName: testUser.username,
        },
        sourceId: 'calendar-tab-1',
      },
    );
  });

  it('rejects empty names and returns 404 when a referenced user does not exist', async () => {
    const createDto = {
      name: '',
      status: 'editing',
      link: 'https://open.spotify.com/playlist/playlist-id',
      type: 'genero',
      updateDate: '2026-10-05T00:00:00.000Z',
      userId: testUser.id,
    };

    await request(app.getHttpServer())
      .post('/api/riff-valley-playlists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createDto)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .patch('/api/riff-valley-playlists/c5dce76c-04b2-4b2b-8ca4-bb7365e86783')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '' })
      .expect(400);
    expect(service.update).not.toHaveBeenCalled();

    service.create.mockRejectedValueOnce(
      new NotFoundException('User not found'),
    );
    await request(app.getHttpServer())
      .post('/api/riff-valley-playlists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...createDto, name: 'Valid name' })
      .expect(404);
    expect(service.create).toHaveBeenCalledWith({
      ...createDto,
      name: 'Valid name',
    });
  });

  it('preserves the clear 400 error for an editorial update rejected by consistency rules', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    service.update.mockRejectedValueOnce(
      new BadRequestException(
        'No se puede cambiar el enlace de una playlist vinculada desde el PATCH editorial.',
      ),
    );

    await request(app.getHttpServer())
      .patch(`/api/riff-valley-playlists/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ link: 'https://open.spotify.com/playlist/otro-id' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'No se puede cambiar el enlace de una playlist vinculada desde el PATCH editorial.',
        );
      });
    expect(service.update).toHaveBeenCalledWith(id, {
      link: 'https://open.spotify.com/playlist/otro-id',
    });
  });
});
