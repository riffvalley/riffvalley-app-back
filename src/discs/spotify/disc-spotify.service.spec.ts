import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SpotifyApiService } from 'src/wordpress/spotify-api.service';
import { Disc } from '../entities/disc.entity';
import { DiscSpotifyService } from './disc-spotify.service';

describe('DiscSpotifyService', () => {
  let service: DiscSpotifyService;
  let discRepository: { createQueryBuilder: jest.Mock };
  let spotifyApiService: { getAlbumTracks: jest.Mock };

  beforeEach(() => {
    discRepository = { createQueryBuilder: jest.fn() };
    spotifyApiService = { getAlbumTracks: jest.fn() };
    service = new DiscSpotifyService(
      discRepository as unknown as Repository<Disc>,
      spotifyApiService as unknown as SpotifyApiService,
    );
  });

  it('passes a found disc name and artist name to Spotify', async () => {
    const query = mockSpotifyTracksQuery({ disc_name: 'Album', artist_name: 'Artist' });
    spotifyApiService.getAlbumTracks.mockResolvedValue([]);

    await expect(service.getSpotifyTracks('disc-id')).resolves.toEqual([]);
    expectSpotifyTracksProjection(query, 'disc-id');
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith(
      'Artist',
      'Album',
    );
  });

  it('uses empty artist name when a found disc has no artist', async () => {
    const query = mockSpotifyTracksQuery({ disc_name: 'Album', artist_name: null });
    spotifyApiService.getAlbumTracks.mockResolvedValue([]);

    await service.getSpotifyTracks('disc-id');

    expectSpotifyTracksProjection(query, 'disc-id');
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith('', 'Album');
  });

  it('preserves a non-empty Spotify payload and maps a missing disc to the current 404', async () => {
    const payload = [{ id: 'spotify-track', name: 'Track', duration: 123 }];
    const query = mockSpotifyTracksQuery({ disc_name: 'Album', artist_name: 'Artist' });
    spotifyApiService.getAlbumTracks.mockResolvedValue(payload);

    await expect(service.getSpotifyTracks('disc-id')).resolves.toBe(payload);
    expectSpotifyTracksProjection(query, 'disc-id');
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith('Artist', 'Album');

    jest.clearAllMocks();
    const missingQuery = mockSpotifyTracksQuery(undefined);

    await expect(service.getSpotifyTracks('missing-id')).rejects.toMatchObject({
      status: 404,
      response: {
        message: 'Disc with id missing-id not found',
        error: 'Not Found',
        statusCode: 404,
      },
    });
    expectSpotifyTracksProjection(missingQuery, 'missing-id');
    expect(spotifyApiService.getAlbumTracks).not.toHaveBeenCalled();

    jest.clearAllMocks();
    const failedQuery = mockSpotifyTracksQuery(undefined);
    failedQuery.getRawOne.mockRejectedValue(new Error('database unavailable'));

    await expect(service.getSpotifyTracks('failed-id')).rejects.toMatchObject({
      status: 404,
      response: { message: 'Disc with id failed-id not found' },
    });
    expect(spotifyApiService.getAlbumTracks).not.toHaveBeenCalled();
  });

  it('propagates Spotify track lookup errors unchanged', async () => {
    mockSpotifyTracksQuery({ disc_name: 'Album', artist_name: 'Artist' });
    const spotifyError = new Error('Spotify unavailable');
    spotifyApiService.getAlbumTracks.mockRejectedValue(spotifyError);

    await expect(service.getSpotifyTracks('disc-id')).rejects.toBe(spotifyError);
  });

  function mockSpotifyTracksQuery(result: unknown) {
    const query = {
      leftJoin: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      getRawOne: jest.fn().mockResolvedValue(result),
    };
    query.leftJoin.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.addSelect.mockReturnValue(query);
    query.where.mockReturnValue(query);
    discRepository.createQueryBuilder.mockReturnValue(query);
    return query;
  }

  function expectSpotifyTracksProjection(
    query: ReturnType<typeof mockSpotifyTracksQuery>,
    id: string,
  ) {
    expect(discRepository.createQueryBuilder).toHaveBeenCalledWith('disc');
    expect(discRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(query.leftJoin).toHaveBeenCalledWith('disc.artist', 'artist');
    expect(query.select).toHaveBeenCalledWith('disc.name', 'disc_name');
    expect(query.addSelect).toHaveBeenCalledWith('artist.name', 'artist_name');
    expect(query.where).toHaveBeenCalledWith('disc.id = :id', { id });
    expect(query.getRawOne).toHaveBeenCalledTimes(1);
  }
});
