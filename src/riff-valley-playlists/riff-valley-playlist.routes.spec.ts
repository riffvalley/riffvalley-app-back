import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { User } from 'src/auth/entities/user.entity';
import { JwtStrategy } from 'src/auth/strategies/jwt.strategy';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { RiffValleyPlaylistController } from './riff-valley-playlist.controller';
import { RiffValleyPlaylistService } from './riff-valley-playlist.service';

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
  const userRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
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
    userRepository.findOneBy.mockResolvedValue(testUser);
    userRepository.findOne.mockResolvedValue({ role: testUser.role });
    moduleRef = await Test.createTestingModule({
      controllers: [RiffValleyPlaylistController],
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'riff-valley-routes-test-secret' }),
      ],
      providers: [
        { provide: RiffValleyPlaylistService, useValue: service },
        { provide: getRepositoryToken(User), useValue: userRepository },
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
      .expect(201, { id: 'content-id', riffValleyPlaylistId: id });
    expect(service.createContentForRiffValleyPlaylist).toHaveBeenCalledWith(id);
  });
});
