import { BadRequestException, NotFoundException, ParseUUIDPipe } from '@nestjs/common';
import { DiscsController } from '../discs.controller';
import { DiscsService } from '../discs.service';

describe('DiscsController baseline', () => {
  let controller: DiscsController;
  let discsService: {
    create: jest.Mock;
    createWithArtist: jest.Mock;
    findAll: jest.Mock;
    findRandom: jest.Mock;
    findOptions: jest.Mock;
    findOne: jest.Mock;
    getSpotifyTracks: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    discsService = {
      create: jest.fn(),
      createWithArtist: jest.fn(),
      findAll: jest.fn(),
      findRandom: jest.fn(),
      findOptions: jest.fn(),
      findOne: jest.fn(),
      getSpotifyTracks: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new DiscsController(discsService as unknown as DiscsService);
  });

  it('delegates POST /discs to the service and returns its response unchanged', async () => {
    const dto = { name: 'Album' } as any;
    const response = { id: 'disc-id', name: 'Album', verified: false };
    discsService.create.mockResolvedValue(response);

    await expect(controller.create(dto)).resolves.toBe(response);
    expect(discsService.create).toHaveBeenCalledWith(dto);
    expect(discsService.create).toHaveBeenCalledTimes(1);
  });

  it('delegates POST /discs/with-artist and returns the detail response unchanged', async () => {
    const dto = { discName: 'Album', artistName: 'Artist' } as any;
    const response = {
      id: 'disc-id',
      name: 'Album',
      artist: { id: 'artist-id', country: { id: 'country-id' } },
    };
    discsService.createWithArtist.mockResolvedValue(response);

    await expect(controller.createWithArtist(dto)).resolves.toBe(response);
    expect(discsService.createWithArtist).toHaveBeenCalledWith(dto);
    expect(discsService.createWithArtist).toHaveBeenCalledTimes(1);
  });

  it('propagates the current ambiguity error from POST /discs/with-artist', async () => {
    const dto = { discName: 'Album', artistName: 'Duplicate' } as any;
    const error = new BadRequestException(
      'Hay 2 artistas con el nombre "Duplicate". Especifica countryId para desambiguar.',
    );
    discsService.createWithArtist.mockRejectedValue(error);

    await expect(controller.createWithArtist(dto)).rejects.toBe(error);
    expect(error.getStatus()).toBe(400);
    expect(discsService.createWithArtist).toHaveBeenCalledWith(dto);
  });

  it('delegates query and authenticated user and returns the service response unchanged', async () => {
    const pagination = { limit: 0, query: 'album' } as any;
    const user = { id: 'user-id' } as any;
    const response = { totalItems: 0, data: [] };
    discsService.findAll.mockResolvedValue(response);

    await expect(controller.findAll(pagination, user)).resolves.toBe(response);
    expect(discsService.findAll).toHaveBeenCalledWith(pagination, user);
  });

  it('delegates the path id and returns the service response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const disc = { id: 'disc-id', name: 'Album' };
    discsService.findOne.mockResolvedValue(disc);

    await expect(controller.findOne(id)).resolves.toBe(disc);
    expect(discsService.findOne).toHaveBeenCalledWith(id);
  });

  it('delegates GET /discs/:id/spotify-tracks and returns the track payload unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const payload = [{ id: 'spotify-track', name: 'Track' }];
    discsService.getSpotifyTracks.mockResolvedValue(payload);

    await expect(controller.getSpotifyTracks(id)).resolves.toBe(payload);
    expect(discsService.getSpotifyTracks).toHaveBeenCalledWith(id);
    expect(discsService.getSpotifyTracks).toHaveBeenCalledTimes(1);
  });

  it('keeps the detail not-found exception for GET /discs/:id', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const notFound = new NotFoundException(`Disc with id ${id} not found`);
    discsService.findOne.mockRejectedValue(notFound);

    await expect(controller.findOne(id)).rejects.toBe(notFound);
    expect(notFound.getStatus()).toBe(404);
    expect(discsService.findOne).toHaveBeenCalledWith(id);
  });

  it('delegates PATCH /discs/:id and returns the saved response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = { name: 'Updated album' } as any;
    const response = {
      id,
      name: 'Updated album',
      artist: { id: 'artist-id', country: { id: 'country-id' } },
      genre: { id: 'genre-id' },
      favorites: [{ id: 'favorite-id' }],
    };
    discsService.update.mockResolvedValue(response);

    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(discsService.update).toHaveBeenCalledWith(id, dto);
    expect(discsService.update).toHaveBeenCalledTimes(1);
  });

  it('delegates DELETE /discs/:id and returns the service response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { message: `Disc with id ${id} has been removed` };
    discsService.remove.mockResolvedValue(response);

    await expect(controller.remove(id)).resolves.toBe(response);
    expect(discsService.remove).toHaveBeenCalledWith(id);
    expect(discsService.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-UUID detail path parameter with a 400 validation error', async () => {
    const pipe = new ParseUUIDPipe();

    await expect(
      pipe.transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'id',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('delegates random catalog queries with the authenticated user', async () => {
    const dto = { limit: 3 } as any;
    const user = { id: 'user-id' } as any;
    const response = [{ id: 'disc-id' }];
    discsService.findRandom.mockResolvedValue(response);

    await expect(controller.findRandom(dto, user)).resolves.toBe(response);
    expect(discsService.findRandom).toHaveBeenCalledWith(dto, user);
  });

  it('delegates catalog option queries and returns their response unchanged', async () => {
    const dto = { field: 'genre' } as any;
    const response = [{ id: 'genre-id', name: 'Genre' }];
    discsService.findOptions.mockResolvedValue(response);

    await expect(controller.findOptions(dto)).resolves.toBe(response);
    expect(discsService.findOptions).toHaveBeenCalledWith(dto);
  });
});
