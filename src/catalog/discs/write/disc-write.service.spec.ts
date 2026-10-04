import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Artist } from '../../artists/entities/artist.entity';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { Disc } from '../entities/disc.entity';
import { DiscWriteService } from './disc-write.service';

describe('DiscWriteService characterization', () => {
  let service: DiscWriteService;
  let discRepository: {
    create: jest.Mock;
    save: jest.Mock;
    preload: jest.Mock;
    delete: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let artistRepository: { find: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    discRepository = {
      create: jest.fn(),
      save: jest.fn(),
      preload: jest.fn(),
      delete: jest.fn(),
      findOneOrFail: jest.fn(),
    };
    artistRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    service = new DiscWriteService(
      discRepository as unknown as Repository<Disc>,
      artistRepository as unknown as Repository<Artist>,
    );
  });

  it('creates a minimal disc, preserves entity defaults and returns it after save', async () => {
    const dto = { name: 'Album' } as CreateDiscDto;
    const entity = new Disc();
    entity.name = dto.name;
    discRepository.create.mockReturnValue(entity);
    discRepository.save.mockImplementation(async (savedDisc: Disc) => {
      savedDisc.id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
      return savedDisc;
    });

    await expect(service.create(dto)).resolves.toBe(entity);

    expect(discRepository.create).toHaveBeenCalledWith(dto);
    expect(discRepository.create).toHaveBeenCalledTimes(1);
    expect(discRepository.save).toHaveBeenCalledWith(entity);
    expect(discRepository.save).toHaveBeenCalledTimes(1);
    expect(entity).toMatchObject({
      id: 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783',
      name: 'Album',
      verified: false,
      ep: false,
      debut: false,
      featured: false,
      pinned: false,
    });
    expect(entity.description).toBeUndefined();
    expect(entity.image).toBeUndefined();
    expect(entity.link).toBeUndefined();
    expect(entity.releaseDate).toBeUndefined();
  });

  it('passes all DTO fields to TypeORM create and persists the resulting entity once', async () => {
    const dto: CreateDiscDto = {
      name: 'Album',
      description: 'Description',
      image: 'https://images.test/album.jpg',
      verified: true,
      link: 'https://album.test',
      artistId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320241',
      genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
      releaseDate: new Date('2024-03-10T00:00:00.000Z'),
      ep: true,
      debut: true,
      featured: true,
      pinned: true,
    };
    const entity = Object.assign(new Disc(), {
      id: 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783',
      name: dto.name,
      description: dto.description,
      image: dto.image,
      verified: dto.verified,
      link: dto.link,
      releaseDate: dto.releaseDate,
      ep: dto.ep,
      debut: dto.debut,
      featured: dto.featured,
      pinned: dto.pinned,
    });
    discRepository.create.mockReturnValue(entity);
    discRepository.save.mockResolvedValue(entity);

    await expect(service.create(dto)).resolves.toBe(entity);

    expect(discRepository.create).toHaveBeenCalledWith(dto);
    expect(discRepository.save).toHaveBeenCalledWith(entity);
    expect(discRepository.create).toHaveBeenCalledTimes(1);
    expect(discRepository.save).toHaveBeenCalledTimes(1);
    expect(entity).toMatchObject({
      name: dto.name,
      description: dto.description,
      image: dto.image,
      verified: true,
      link: dto.link,
      releaseDate: dto.releaseDate,
      ep: true,
      debut: true,
      featured: true,
      pinned: true,
    });
    expect(entity.artist).toBeUndefined();
    expect(entity.genre).toBeUndefined();
  });

  it('maps PostgreSQL unique violation 23505 to the current bad request detail', async () => {
    const dto = { name: 'Album' } as CreateDiscDto;
    const entity = new Disc();
    discRepository.create.mockReturnValue(entity);
    discRepository.save.mockRejectedValue({
      code: '23505',
      detail: 'Key (name)=(Album) already exists.',
    });

    try {
      await service.create(dto);
      throw new Error('Expected create to reject');
    } catch (error) {
      expect(error).toMatchObject({ status: 400 });
      expect((error as any).getResponse()).toEqual({
        message: 'Key (name)=(Album) already exists.',
        error: 'Bad Request',
        statusCode: 400,
      });
    }
    expect(discRepository.create).toHaveBeenCalledTimes(1);
    expect(discRepository.save).toHaveBeenCalledWith(entity);
    expect(discRepository.save).toHaveBeenCalledTimes(1);
  });

  it('logs other persistence failures and maps them to the current generic 500', async () => {
    const dto = { name: 'Album' } as CreateDiscDto;
    const entity = new Disc();
    const persistenceError = new Error('database unavailable');
    const logError = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();
    discRepository.create.mockReturnValue(entity);
    discRepository.save.mockRejectedValue(persistenceError);

    try {
      await service.create(dto);
      throw new Error('Expected create to reject');
    } catch (error) {
      expect(error).toMatchObject({ status: 500 });
      expect((error as any).getResponse()).toEqual({
        message: 'An unexpected error occurred',
        error: 'Internal Server Error',
        statusCode: 500,
      });
    }
    expect(logError).toHaveBeenCalledWith(persistenceError);
    expect(discRepository.save).toHaveBeenCalledTimes(1);
  });

  describe('update mapping', () => {
    const discId = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';

    it('preloads a partial scalar patch, retains omitted fields and returns the saved entity', async () => {
      const artist = {
        id: 'existing-artist',
        name: 'Existing Artist',
        country: { id: 'country-id', name: 'Country', isoCode: 'CT' },
      };
      const genre = { id: 'existing-genre', name: 'Existing Genre' };
      const eagerRelations = {
        favorites: [{ id: 'favorite-id', user: { id: 'user-id' } }],
        pendings: [{ id: 'pending-id', user: { id: 'user-id' } }],
        comments: [{ id: 'comment-id', user: { id: 'user-id' } }],
      };
      const disc = Object.assign(new Disc(), {
        id: discId,
        name: 'Old name',
        description: 'Keep this description',
        image: 'https://images.test/old.jpg',
        link: 'https://album.test',
        releaseDate: new Date('2020-01-02T00:00:00.000Z'),
        artist,
        genre,
        ...eagerRelations,
      });
      const dto = { name: 'New name' };
      discRepository.preload.mockImplementation(async (patch: Partial<Disc>) =>
        Object.assign(disc, patch),
      );
      discRepository.save.mockResolvedValue(disc);

      await expect(service.update(discId, dto as any)).resolves.toBe(disc);

      expect(discRepository.preload).toHaveBeenCalledWith({
        id: discId,
        name: 'New name',
      });
      expect(discRepository.preload).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledWith(disc);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
      expect(disc).toMatchObject({
        name: 'New name',
        description: 'Keep this description',
        image: 'https://images.test/old.jpg',
        link: 'https://album.test',
        artist,
        genre,
        ...eagerRelations,
      });
      expect(disc.releaseDate).toEqual(new Date('2020-01-02T00:00:00.000Z'));
    });

    it('passes all supplied scalar fields to preload and assigns supplied relation IDs as references', async () => {
      const dto = {
        name: 'New name',
        description: 'Updated description',
        image: 'https://images.test/new.jpg',
        verified: true,
        link: 'https://new-album.test',
        releaseDate: new Date('2024-03-10T00:00:00.000Z'),
        ep: true,
        debut: true,
        featured: true,
        pinned: true,
        artistId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320241',
        genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
      };
      const disc = Object.assign(new Disc(), { id: discId, name: 'Old name' });
      discRepository.preload.mockResolvedValue(disc);
      discRepository.save.mockResolvedValue(disc);

      await expect(service.update(discId, dto as any)).resolves.toBe(disc);

      expect(discRepository.preload).toHaveBeenCalledWith({
        id: discId,
        name: dto.name,
        description: dto.description,
        image: dto.image,
        verified: dto.verified,
        link: dto.link,
        releaseDate: dto.releaseDate,
        ep: dto.ep,
        debut: dto.debut,
        featured: dto.featured,
        pinned: dto.pinned,
      });
      expect(disc.artist).toEqual({ id: dto.artistId });
      expect(disc.genre).toEqual({ id: dto.genreId });
      expect(discRepository.save).toHaveBeenCalledWith(disc);
      expect(discRepository.preload).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
    });

    it('preserves false booleans and passes nullable scalar values through preload', async () => {
      const dto = {
        verified: false,
        ep: false,
        debut: false,
        featured: false,
        pinned: false,
        description: null,
      };
      const disc = Object.assign(new Disc(), { id: discId, name: 'Album' });
      discRepository.preload.mockImplementation(async (patch: Partial<Disc>) =>
        Object.assign(disc, patch),
      );
      discRepository.save.mockResolvedValue(disc);

      await expect(service.update(discId, dto as any)).resolves.toBe(disc);

      expect(discRepository.preload).toHaveBeenCalledWith({
        id: discId,
        ...dto,
      });
      expect(disc).toMatchObject({
        verified: false,
        ep: false,
        debut: false,
        featured: false,
        pinned: false,
        description: null,
      });
      expect(discRepository.save).toHaveBeenCalledWith(disc);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
    });

    it('retains existing Artist and Genre when their IDs are omitted', async () => {
      const artist = { id: 'existing-artist' };
      const genre = { id: 'existing-genre' };
      const disc = Object.assign(new Disc(), { id: discId, artist, genre });
      discRepository.preload.mockResolvedValue(disc);
      discRepository.save.mockResolvedValue(disc);

      await service.update(discId, {} as any);

      expect(discRepository.preload).toHaveBeenCalledWith({ id: discId });
      expect(disc.artist).toBe(artist);
      expect(disc.genre).toBe(genre);
      expect(discRepository.save).toHaveBeenCalledWith(disc);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
    });

    it('does not clear Artist or Genre when nullable relation IDs are null', async () => {
      const artist = { id: 'existing-artist' };
      const genre = { id: 'existing-genre' };
      const disc = Object.assign(new Disc(), { id: discId, artist, genre });
      discRepository.preload.mockResolvedValue(disc);
      discRepository.save.mockResolvedValue(disc);

      await service.update(discId, { artistId: null, genreId: null } as any);

      expect(discRepository.preload).toHaveBeenCalledWith({ id: discId });
      expect(disc.artist).toBe(artist);
      expect(disc.genre).toBe(genre);
      expect(discRepository.save).toHaveBeenCalledWith(disc);
    });

    it('returns 404 and does not save when preload cannot find the disc', async () => {
      discRepository.preload.mockResolvedValue(undefined);

      await expect(
        service.update(discId, { name: 'New name' } as any),
      ).rejects.toMatchObject({
        status: 404,
        response: { message: `Disc with id ${discId} not found` },
      });

      expect(discRepository.preload).toHaveBeenCalledWith({
        id: discId,
        name: 'New name',
      });
      expect(discRepository.save).not.toHaveBeenCalled();
    });

    it('maps PostgreSQL unique violation 23505 from save to the current bad request detail', async () => {
      const disc = Object.assign(new Disc(), { id: discId, name: 'Album' });
      discRepository.preload.mockResolvedValue(disc);
      discRepository.save.mockRejectedValue({
        code: '23505',
        detail: 'Key (name)=(Album) already exists.',
      });

      try {
        await service.update(discId, { name: 'Album' } as any);
        throw new Error('Expected update to reject');
      } catch (error) {
        expect(error).toMatchObject({ status: 400 });
        expect((error as any).getResponse()).toEqual({
          message: 'Key (name)=(Album) already exists.',
          error: 'Bad Request',
          statusCode: 400,
        });
      }
      expect(discRepository.preload).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledWith(disc);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
    });

    it('logs other save failures and maps them to the current generic 500', async () => {
      const disc = Object.assign(new Disc(), { id: discId, name: 'Album' });
      const persistenceError = new Error('database unavailable');
      const logError = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation();
      discRepository.preload.mockResolvedValue(disc);
      discRepository.save.mockRejectedValue(persistenceError);

      try {
        await service.update(discId, { name: 'New name' } as any);
        throw new Error('Expected update to reject');
      } catch (error) {
        expect(error).toMatchObject({ status: 500 });
        expect((error as any).getResponse()).toEqual({
          message: 'An unexpected error occurred',
          error: 'Internal Server Error',
          statusCode: 500,
        });
      }
      expect(logError).toHaveBeenCalledWith(persistenceError);
      expect(discRepository.preload).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
    });

    it('propagates preload errors unchanged because translation wraps save only', async () => {
      const preloadError = new Error('preload query failed');
      discRepository.preload.mockRejectedValue(preloadError);

      await expect(
        service.update(discId, { name: 'New name' } as any),
      ).rejects.toBe(preloadError);

      expect(discRepository.preload).toHaveBeenCalledTimes(1);
      expect(discRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const discId = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';

    it('deletes by ID in one repository call and returns the exact current message', async () => {
      discRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.remove(discId)).resolves.toEqual({
        message: `Disc with id ${discId} has been removed`,
      });

      expect(discRepository.delete).toHaveBeenCalledWith({ id: discId });
      expect(discRepository.delete).toHaveBeenCalledTimes(1);
      expect(discRepository.findOneOrFail).not.toHaveBeenCalled();
      expect(discRepository.preload).not.toHaveBeenCalled();
    });

    it('returns the current 404 when delete reports zero affected rows', async () => {
      discRepository.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.remove(discId)).rejects.toMatchObject({
        status: 404,
        response: { message: `Disc with id ${discId} not found` },
      });

      expect(discRepository.delete).toHaveBeenCalledWith({ id: discId });
      expect(discRepository.delete).toHaveBeenCalledTimes(1);
      expect(discRepository.findOneOrFail).not.toHaveBeenCalled();
    });

    it('propagates persistence errors unchanged', async () => {
      const persistenceError = new Error('delete failed');
      discRepository.delete.mockRejectedValue(persistenceError);

      await expect(service.remove(discId)).rejects.toBe(persistenceError);

      expect(discRepository.delete).toHaveBeenCalledWith({ id: discId });
      expect(discRepository.delete).toHaveBeenCalledTimes(1);
      expect(discRepository.findOneOrFail).not.toHaveBeenCalled();
    });
  });

  describe('resolveArtist', () => {
    const resolveArtist = (artistName: string, countryId?: string) =>
      (service as any).resolveArtist(artistName, countryId) as Promise<Artist>;

    it('creates and saves an artist when there are no matches and countryId is absent', async () => {
      const artistName = '  Árbol de Ñandú  ';
      const createdArtist = {
        name: artistName,
        nameNormalized: 'arbol de nandu',
      };
      const savedArtist = { ...createdArtist, id: 'artist-id' };
      artistRepository.find.mockResolvedValue([]);
      artistRepository.create.mockReturnValue(createdArtist);
      artistRepository.save.mockResolvedValue(savedArtist);

      await expect(resolveArtist(artistName)).resolves.toBe(savedArtist);

      expect(artistRepository.find).toHaveBeenCalledWith({
        where: {
          name: expect.objectContaining({ type: 'ilike', value: artistName }),
        },
      });
      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).toHaveBeenCalledWith({
        name: artistName,
        nameNormalized: 'arbol de nandu',
      });
      expect(artistRepository.create).toHaveBeenCalledTimes(1);
      expect(artistRepository.save).toHaveBeenCalledWith(createdArtist);
      expect(artistRepository.save).toHaveBeenCalledTimes(1);
    });

    it('reuses one case-insensitive match even when a different countryId is supplied', async () => {
      const artistName = 'NIRVANA';
      const existingArtist = {
        id: 'artist-id',
        name: 'Nirvana',
        countryId: 'country-existing',
      };
      artistRepository.find.mockResolvedValue([existingArtist]);

      await expect(resolveArtist(artistName, 'country-other')).resolves.toBe(
        existingArtist,
      );

      const [query] = artistRepository.find.mock.calls[0];
      expect(query.where.name.type).toBe('ilike');
      expect(query.where.name.value).toBe(artistName);
      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).not.toHaveBeenCalled();
      expect(artistRepository.save).not.toHaveBeenCalled();
    });

    it('rejects multiple matches without countryId using the current message', async () => {
      artistRepository.find.mockResolvedValue([
        { id: 'artist-one', name: 'Múneca', countryId: 'country-one' },
        { id: 'artist-two', name: 'Múneca', countryId: 'country-two' },
      ]);

      try {
        await resolveArtist('Múneca');
        throw new Error('Expected resolveArtist to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
        expect((error as BadRequestException).getResponse()).toEqual({
          message:
            'Hay 2 artistas con el nombre "Múneca". Especifica countryId para desambiguar.',
          error: 'Bad Request',
          statusCode: 400,
        });
      }

      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).not.toHaveBeenCalled();
      expect(artistRepository.save).not.toHaveBeenCalled();
    });

    it('reuses the matching country among multiple artists', async () => {
      const matchingArtist = {
        id: 'artist-two',
        name: 'Múneca',
        countryId: 'country-two',
      };
      artistRepository.find.mockResolvedValue([
        { id: 'artist-one', name: 'Múneca', countryId: 'country-one' },
        matchingArtist,
      ]);

      await expect(resolveArtist('Múneca', 'country-two')).resolves.toBe(
        matchingArtist,
      );

      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).not.toHaveBeenCalled();
      expect(artistRepository.save).not.toHaveBeenCalled();
    });

    it('creates a new artist when no duplicate has the supplied countryId', async () => {
      const artistName = 'Múneca';
      const countryId = 'country-new';
      const createdArtist = {
        name: artistName,
        nameNormalized: 'muneca',
        countryId,
      };
      const savedArtist = { ...createdArtist, id: 'artist-new' };
      artistRepository.find.mockResolvedValue([
        { id: 'artist-one', name: artistName, countryId: 'country-one' },
        { id: 'artist-two', name: artistName, countryId: 'country-two' },
      ]);
      artistRepository.create.mockReturnValue(createdArtist);
      artistRepository.save.mockResolvedValue(savedArtist);

      await expect(resolveArtist(artistName, countryId)).resolves.toBe(
        savedArtist,
      );

      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).toHaveBeenCalledWith({
        name: artistName,
        nameNormalized: 'muneca',
        countryId,
      });
      expect(artistRepository.create).toHaveBeenCalledTimes(1);
      expect(artistRepository.save).toHaveBeenCalledWith(createdArtist);
      expect(artistRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('createWithArtist mapping', () => {
    const generatedDiscId = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';

    beforeEach(() => {
      discRepository.create.mockImplementation((values: Partial<Disc>) =>
        Object.assign(new Disc(), values),
      );
      discRepository.save.mockImplementation(async (disc: Disc) => {
        Object.assign(disc, {
          id: generatedDiscId,
          description: disc.description ?? null,
          image: disc.image ?? null,
          link: disc.link ?? null,
          releaseDate: disc.releaseDate ?? null,
        });
        return disc;
      });
    });

    it('saves a minimal disc with a reused artist and returns the full saved graph', async () => {
      const country = { id: 'country-id', name: 'Country', isoCode: 'CT' };
      const existingArtist = Object.assign(new Artist(), {
        id: 'artist-id',
        name: 'Artist',
        nameNormalized: 'artist',
        description: null,
        image: null,
        countryId: country.id,
        needsReview: false,
        updatedAt: new Date('2024-01-02T03:04:05.000Z'),
        country,
      });
      const dto: CreateDiscWithArtistDto = {
        discName: 'Album',
        artistName: 'Artist',
      };
      artistRepository.find.mockResolvedValue([existingArtist]);

      const result = await service.createWithArtist(dto);

      expect(artistRepository.find).toHaveBeenCalledWith({
        where: {
          name: expect.objectContaining({
            type: 'ilike',
            value: dto.artistName,
          }),
        },
      });
      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).not.toHaveBeenCalled();
      expect(artistRepository.save).not.toHaveBeenCalled();
      expect(discRepository.create).toHaveBeenCalledWith({
        name: 'Album',
        artist: existingArtist,
        ep: false,
        debut: false,
        link: undefined,
        image: undefined,
        description: undefined,
      });
      expect(discRepository.create).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledWith(result);
      expect(result).toBe(discRepository.create.mock.results[0].value);
      expect(JSON.parse(JSON.stringify(result))).toEqual({
        id: generatedDiscId,
        name: 'Album',
        description: null,
        image: null,
        verified: false,
        ep: false,
        debut: false,
        link: null,
        releaseDate: null,
        featured: false,
        pinned: false,
        artist: {
          id: 'artist-id',
          name: 'Artist',
          nameNormalized: 'artist',
          description: null,
          image: null,
          countryId: 'country-id',
          needsReview: false,
          updatedAt: '2024-01-02T03:04:05.000Z',
          country,
        },
      });
    });

    it('maps every DTO field, creates an artist, assigns an optional genre and converts the date', async () => {
      const dto: CreateDiscWithArtistDto = {
        discName: 'Second Album',
        artistName: 'New Band',
        countryId: 'country-new',
        genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
        releaseDate: '2002-03-04',
        ep: true,
        debut: false,
        link: 'https://album.test',
        image: 'https://images.test/album.jpg',
        description: 'Album description',
      };
      const createArtist = artistRepository.create.mockImplementation(
        (values: Partial<Artist>) => Object.assign(new Artist(), values),
      );
      artistRepository.find.mockResolvedValue([]);
      artistRepository.save.mockImplementation(async (artist: Artist) => {
        Object.assign(artist, {
          id: 'new-artist-id',
          description: artist.description ?? null,
          image: artist.image ?? null,
          needsReview: artist.needsReview ?? true,
          updatedAt: new Date('2024-05-06T07:08:09.000Z'),
        });
        return artist;
      });

      const result = await service.createWithArtist(dto);
      const createdDisc = discRepository.create.mock.results[0].value as Disc;

      expect(artistRepository.find).toHaveBeenCalledTimes(1);
      expect(artistRepository.create).toHaveBeenCalledWith({
        name: 'New Band',
        nameNormalized: 'new band',
        countryId: 'country-new',
      });
      expect(createArtist).toHaveBeenCalledTimes(1);
      expect(artistRepository.save).toHaveBeenCalledTimes(1);
      expect(discRepository.create).toHaveBeenCalledWith({
        name: 'Second Album',
        artist: expect.objectContaining({ id: 'new-artist-id' }),
        genre: { id: dto.genreId },
        releaseDate: new Date('2002-03-04T00:00:00.000Z'),
        ep: true,
        debut: false,
        link: 'https://album.test',
        image: 'https://images.test/album.jpg',
        description: 'Album description',
      });
      expect(discRepository.create).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledTimes(1);
      expect(discRepository.save).toHaveBeenCalledWith(createdDisc);
      expect(result).toBe(createdDisc);
      expect(result.artist.country).toBeUndefined();
      expect(JSON.parse(JSON.stringify(result))).toEqual({
        id: generatedDiscId,
        name: 'Second Album',
        description: 'Album description',
        image: 'https://images.test/album.jpg',
        verified: false,
        ep: true,
        debut: false,
        link: 'https://album.test',
        releaseDate: '2002-03-04T00:00:00.000Z',
        featured: false,
        pinned: false,
        artist: {
          id: 'new-artist-id',
          name: 'New Band',
          nameNormalized: 'new band',
          description: null,
          image: null,
          countryId: 'country-new',
          needsReview: true,
          updatedAt: '2024-05-06T07:08:09.000Z',
        },
        genre: { id: dto.genreId },
      });
      expect(result.artist.countryId).toBe(dto.countryId);
    });
  });
});
