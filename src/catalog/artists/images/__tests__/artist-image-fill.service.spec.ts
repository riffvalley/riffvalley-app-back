import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Artist } from '../../entities/artist.entity';
import { ArtistImageFillService } from '../artist-image-fill.service';
import { FillArtistImagesDto } from '../dto/fill-artist-images.dto';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api/spotify-public-api.service';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];

function makeBuilder<T>(
  values: {
    count?: number;
    raw?: T;
    many?: Artist[];
    exists?: boolean;
    affected?: number;
  } = {},
) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(values.count ?? 0),
    getRawOne: jest.fn().mockResolvedValue(values.raw),
    getMany: jest.fn().mockResolvedValue(values.many ?? []),
    getExists: jest.fn().mockResolvedValue(values.exists ?? false),
    execute: jest.fn().mockResolvedValue({ affected: values.affected ?? 0 }),
  };
  return builder;
}

async function makeService(
  builders: Array<ReturnType<typeof makeBuilder>>,
  spotify: Pick<SpotifyPublicApiService, 'findArtistCandidates'>,
) {
  const repository = {
    createQueryBuilder: jest.fn(() => builders.shift()),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      ArtistImageFillService,
      { provide: getRepositoryToken(Artist), useValue: repository },
      { provide: SpotifyPublicApiService, useValue: spotify },
    ],
  }).compile();
  return {
    service: moduleRef.get(ArtistImageFillService),
    repository,
    moduleRef,
  };
}

function artist(
  id: string,
  name: string,
  image: string | null = null,
  needsReview = false,
): Artist {
  return { id, name, image, needsReview } as Artist;
}

describe('ArtistImageFillService', () => {
  it('previews eligible count and estimates ten-item pages with a starting cursor', async () => {
    const countQuery = makeBuilder({ count: 21 });
    const maxQuery = makeBuilder({ raw: { maxId: ids[3] } });
    const { service, moduleRef } = await makeService([countQuery, maxQuery], {
      findArtistCandidates: jest.fn(),
    });

    await expect(service.preview()).resolves.toEqual({
      eligible: 21,
      batchSize: 10,
      estimatedBatches: 3,
      startCursor: Buffer.from(
        JSON.stringify({ version: 1, after: null, upperBound: ids[3] }),
      ).toString('base64url'),
    });
    expect(maxQuery.orderBy).toHaveBeenCalledWith('artist.id', 'DESC');
    expect(maxQuery.take).toHaveBeenCalledWith(1);
    await moduleRef.close();
  });

  it('previews an empty catalog without a cursor or estimated requests', async () => {
    const { service, moduleRef } = await makeService(
      [makeBuilder({ count: 0 }), makeBuilder({ raw: { maxId: null } })],
      { findArtistCandidates: jest.fn() },
    );

    await expect(service.preview()).resolves.toEqual({
      eligible: 0,
      batchSize: 10,
      estimatedBatches: 0,
      startCursor: null,
    });
    await moduleRef.close();
  });

  it('advances the cursor for missing, ambiguous and failed lookups and records every ID', async () => {
    const batch = [
      artist(ids[0], 'No Match'),
      artist(ids[1], 'Twin'),
      artist(ids[2], 'Provider Down'),
    ];
    const nextPage = makeBuilder({ exists: true });
    const spotify = {
      findArtistCandidates: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            spotifyId: 'a',
            name: 'Twin',
            imageUrl: 'a.jpg',
            listenUrl: null,
            genres: [],
          },
          {
            spotifyId: 'b',
            name: 'Twin',
            imageUrl: 'b.jpg',
            listenUrl: null,
            genres: [],
          },
        ])
        .mockRejectedValueOnce(new Error('provider unavailable')),
    };
    const { service, moduleRef } = await makeService(
      [makeBuilder({ many: batch }), nextPage],
      spotify,
    );
    const cursor = Buffer.from(
      JSON.stringify({ version: 1, after: null, upperBound: ids[3] }),
    ).toString('base64url');

    const result = await service.fill(
      Object.assign(new FillArtistImagesDto(), { cursor, batchSize: 3 }),
    );

    expect(result).toMatchObject({
      processed: 3,
      updated: 0,
      notFound: 1,
      ambiguous: 1,
      failed: 1,
      concurrentUpdates: 0,
      hasMore: true,
      results: [
        { artistId: ids[0], outcome: 'not_found' },
        {
          artistId: ids[1],
          outcome: 'ambiguous',
          reason: 'multiple_name_matches',
        },
        { artistId: ids[2], outcome: 'failed', reason: 'provider_error' },
      ],
    });
    expect(result.nextCursor).toBe(
      Buffer.from(
        JSON.stringify({ version: 1, after: ids[2], upperBound: ids[3] }),
      ).toString('base64url'),
    );
    expect(spotify.findArtistCandidates).toHaveBeenNthCalledWith(
      1,
      'No Match',
      1500,
    );
    await moduleRef.close();
  });

  it('reports a conditional write race without overwriting an existing image', async () => {
    const updateQuery = makeBuilder({ affected: 0 });
    const finished = makeBuilder({ exists: false });
    const spotify = {
      findArtistCandidates: jest.fn().mockResolvedValue([
        {
          spotifyId: 'real-provider-id',
          name: 'The Artist',
          imageUrl: 'spotify.jpg',
          listenUrl: null,
          genres: [],
        },
      ]),
    };
    const { service, moduleRef } = await makeService(
      [
        makeBuilder({ many: [artist(ids[0], 'The Artist')] }),
        updateQuery,
        finished,
      ],
      spotify,
    );
    const cursor = Buffer.from(
      JSON.stringify({ version: 1, after: null, upperBound: ids[0] }),
    ).toString('base64url');

    const result = await service.fill(
      Object.assign(new FillArtistImagesDto(), { cursor }),
    );

    expect(result).toMatchObject({
      processed: 1,
      updated: 0,
      concurrentUpdates: 1,
      nextCursor: null,
      hasMore: false,
      results: [
        {
          artistId: ids[0],
          outcome: 'concurrent_update',
          reason: 'image_already_set',
        },
      ],
    });
    expect(updateQuery.set).toHaveBeenCalledWith({
      image: 'spotify.jpg',
      needsReview: false,
    });
    expect(updateQuery.where).toHaveBeenCalledWith('id = :id', { id: ids[0] });
    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'image IS NOT DISTINCT FROM :selectedImage',
      { selectedImage: null },
    );
    await moduleRef.close();
  });

  it('corrects a review-pending image and clears needsReview conditionally', async () => {
    const updateQuery = makeBuilder({ affected: 1 });
    const finished = makeBuilder({ exists: false });
    const spotify = {
      findArtistCandidates: jest.fn().mockResolvedValue([
        {
          spotifyId: 'provider-id',
          name: 'The Artist',
          imageUrl: 'corrected.jpg',
          listenUrl: null,
          genres: [],
        },
      ]),
    };
    const { service, moduleRef } = await makeService(
      [
        makeBuilder({ many: [artist(ids[0], 'The Artist', 'old.jpg', true)] }),
        updateQuery,
        finished,
      ],
      spotify,
    );
    const cursor = Buffer.from(
      JSON.stringify({ version: 1, after: null, upperBound: ids[0] }),
    ).toString('base64url');

    const result = await service.fill(
      Object.assign(new FillArtistImagesDto(), { cursor }),
    );

    expect(result).toMatchObject({ processed: 1, updated: 1, hasMore: false });
    expect(updateQuery.set).toHaveBeenCalledWith({
      image: 'corrected.jpg',
      needsReview: false,
    });
    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'image IS NOT DISTINCT FROM :selectedImage',
      { selectedImage: 'old.jpg' },
    );
    expect(updateQuery.andWhere).toHaveBeenCalledWith('"needsReview" = true');
    await moduleRef.close();
  });

  it('rejects malformed cursors before querying the repository', async () => {
    const { service, repository, moduleRef } = await makeService([], {
      findArtistCandidates: jest.fn(),
    });

    await expect(
      service.fill(
        Object.assign(new FillArtistImagesDto(), { cursor: 'invalid' }),
      ),
    ).rejects.toThrow('Cursor de imágenes de artistas no válido');
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    await moduleRef.close();
  });
});
