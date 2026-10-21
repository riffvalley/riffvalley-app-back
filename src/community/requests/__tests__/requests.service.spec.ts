import {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  getMetadataArgsStorage,
} from 'typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { CreateRequestDto } from '../dto/create-request.dto';
import { DiscRequest, RequestStatus } from '../entities/disc-request.entity';
import { RequestsService } from '../requests.service';

function repositoryMock<T extends ObjectLiteral, M extends object>(
  entity: EntityTarget<T>,
  methods: M,
): Repository<T> & M {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'requests-test',
  });
  const repository = new Repository<T>(entity, new EntityManager(dataSource));
  return Object.assign(repository, methods);
}

function requestFixture(values: Partial<DiscRequest>): DiscRequest {
  return Object.assign(new DiscRequest(), values);
}

function createService(
  requestRepo: Repository<DiscRequest>,
  artistRepo: Repository<Artist> = repositoryMock(Artist, {}),
  discRepo: Repository<Disc> = repositoryMock(Disc, {}),
): RequestsService {
  return new RequestsService(
    requestRepo,
    artistRepo,
    discRepo,
    repositoryMock(Genre, {}),
    repositoryMock(Country, {}),
  );
}

describe('RequestsService characterization', () => {
  it('preserves eager request relations and createdAt-descending read order', async () => {
    const eagerPayload = requestFixture({
      id: 'request-id',
      user: Object.assign(new User(), { id: 'user-id' }),
      genre: Object.assign(new Genre(), { id: 'genre-id' }),
      country: Object.assign(new Country(), { id: 'country-id' }),
    });
    const requestRepo = repositoryMock(DiscRequest, {
      find: jest
        .fn<Promise<DiscRequest[]>, [FindManyOptions<DiscRequest>]>()
        .mockResolvedValue([eagerPayload]),
    });
    const service = createService(requestRepo);

    const relations = getMetadataArgsStorage().relations.filter(
      (relation) => relation.target === DiscRequest,
    );
    const userRelation = relations.find(
      (relation) => relation.propertyName === 'user',
    );
    const genreRelation = relations.find(
      (relation) => relation.propertyName === 'genre',
    );
    const countryRelation = relations.find(
      (relation) => relation.propertyName === 'country',
    );
    const inverseRequests = getMetadataArgsStorage().relations.find(
      (relation) =>
        relation.target === User && relation.propertyName === 'requests',
    );

    expect(userRelation).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true },
    });
    expect(genreRelation).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, nullable: true },
    });
    expect(countryRelation).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, nullable: true },
    });
    expect(inverseRequests?.relationType).toBe('one-to-many');
    await expect(service.findAll()).resolves.toEqual([eagerPayload]);
    expect(requestRepo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
    });
    await expect(
      service.findByUser(Object.assign(new User(), { id: 'user-id' })),
    ).resolves.toEqual([eagerPayload]);
    expect(requestRepo.find).toHaveBeenLastCalledWith({
      where: { user: { id: 'user-id' } },
      order: { createdAt: 'DESC' },
    });
  });

  it('creates a request linked to the authenticated user and optional Catalog references', async () => {
    const user = Object.assign(new User(), { id: 'user-id' });
    const dto = Object.assign(new CreateRequestDto(), {
      discName: 'Record',
      artistName: 'Band',
      genreId: 'genre-id',
      countryId: 'country-id',
    });
    const request = Object.assign(new DiscRequest(), { ...dto, user });
    const requestRepo = repositoryMock(DiscRequest, {
      create: jest
        .fn<DiscRequest, [DeepPartial<DiscRequest>]>()
        .mockReturnValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockResolvedValue(request),
    });
    const service = createService(requestRepo);

    await expect(service.create(dto, user)).resolves.toBe(request);
    expect(requestRepo.create).toHaveBeenCalledWith({
      ...dto,
      user,
      genre: { id: 'genre-id' },
      country: { id: 'country-id' },
    });
    expect(requestRepo.save).toHaveBeenCalledWith(request);
  });

  it('stores omitted optional fields as absent relations and passes save failures through', async () => {
    const user = Object.assign(new User(), { id: 'user-id' });
    const dto = Object.assign(new CreateRequestDto(), {
      discName: 'Record',
      artistName: 'Band',
    });
    const request = Object.assign(new DiscRequest(), { ...dto, user });
    const saveError = new Error('database constraint failure');
    const requestRepo = repositoryMock(DiscRequest, {
      create: jest
        .fn<DiscRequest, [DeepPartial<DiscRequest>]>()
        .mockReturnValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockRejectedValue(saveError),
    });
    const service = createService(requestRepo);

    await expect(service.create(dto, user)).rejects.toBe(saveError);
    expect(requestRepo.create).toHaveBeenCalledWith({
      ...dto,
      user,
      genre: null,
      country: null,
    });
  });

  it('approves a pending request by materializing Artist and Disc through Catalog repositories', async () => {
    const request = requestFixture({
      id: 'request-id',
      artistName: 'The Band',
      discName: 'First Record',
      releaseDate: new Date('2020-01-02'),
      ep: false,
      debut: true,
      description: 'Description',
      image: 'image.png',
      link: 'https://example.test/record',
      status: RequestStatus.PENDING,
      genre: Object.assign(new Genre(), { id: 'genre-id' }),
      country: Object.assign(new Country(), { id: 'country-id' }),
    });
    const artist = Object.assign(new Artist(), {
      id: 'artist-id',
      name: request.artistName,
    });
    const disc = Object.assign(new Disc(), {
      id: 'disc-id',
      name: request.discName,
      artist,
    });
    const requestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest
        .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
        .mockResolvedValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockImplementation(async (saved) => saved),
    });
    const artistRepo = repositoryMock(Artist, {
      findOne: jest
        .fn<Promise<Artist | null>, [FindOneOptions<Artist>]>()
        .mockResolvedValue(null),
      create: jest.fn<Artist, [DeepPartial<Artist>]>().mockReturnValue(artist),
      save: jest.fn<Promise<Artist>, [Artist]>().mockResolvedValue(artist),
    });
    const discRepo = repositoryMock(Disc, {
      create: jest.fn<Disc, [DeepPartial<Disc>]>().mockReturnValue(disc),
      save: jest.fn<Promise<Disc>, [Disc]>().mockResolvedValue(disc),
    });
    const service = createService(requestRepo, artistRepo, discRepo);

    await expect(service.approve(request.id)).resolves.toBe(disc);
    expect(artistRepo.findOne).toHaveBeenCalledWith({
      where: { nameNormalized: 'the band' },
    });
    expect(artistRepo.create).toHaveBeenCalledWith({
      name: request.artistName,
      nameNormalized: 'the band',
      countryId: request.country.id,
    });
    expect(artistRepo.save).toHaveBeenCalledWith(artist);
    expect(discRepo.create).toHaveBeenCalledWith({
      name: request.discName,
      releaseDate: request.releaseDate,
      ep: request.ep,
      debut: request.debut,
      description: request.description,
      image: request.image,
      link: request.link,
      artist,
      genre: request.genre,
    });
    expect(discRepo.save).toHaveBeenCalledWith(disc);
    expect(request.status).toBe(RequestStatus.APPROVED);
    expect(requestRepo.save).toHaveBeenCalledWith(request);

    await expect(service.approve(request.id)).rejects.toThrow(
      'Esta petición ya fue procesada',
    );
    expect(artistRepo.findOne).toHaveBeenCalledTimes(1);
    expect(discRepo.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Björk', 'bjork'],
    ['Band + Co', 'band co'],
    ['The  Band', 'the band'],
    ['  Björk  +  Co  ', 'bjork co'],
  ])(
    'reuses an existing Artist when %j normalizes to %j',
    async (artistName, nameNormalized) => {
      const request = requestFixture({
        id: 'request-id',
        artistName,
        discName: 'Requested Record',
        status: RequestStatus.PENDING,
        genre: Object.assign(new Genre(), { id: 'genre-id' }),
      });
      const existingArtist = Object.assign(new Artist(), {
        id: 'existing-artist-id',
        name: 'Visible Artist Name',
        nameNormalized,
      });
      const requestRepo = repositoryMock(DiscRequest, {
        findOneBy: jest
          .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
          .mockResolvedValue(request),
        save: jest
          .fn<Promise<DiscRequest>, [DiscRequest]>()
          .mockImplementation(async (saved) => saved),
      });
      const artistRepo = repositoryMock(Artist, {
        findOne: jest
          .fn<Promise<Artist | null>, [FindOneOptions<Artist>]>()
          .mockResolvedValue(existingArtist),
        create: jest.fn<Artist, [DeepPartial<Artist>]>(),
        save: jest.fn<Promise<Artist>, [Artist]>(),
      });
      const disc = Object.assign(new Disc(), {
        id: 'disc-id',
        artist: existingArtist,
      });
      const discRepo = repositoryMock(Disc, {
        create: jest.fn<Disc, [DeepPartial<Disc>]>().mockReturnValue(disc),
        save: jest.fn<Promise<Disc>, [Disc]>().mockResolvedValue(disc),
      });
      const service = createService(requestRepo, artistRepo, discRepo);

      await expect(service.approve(request.id)).resolves.toBe(disc);
      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized },
      });
      expect(artistRepo.create).not.toHaveBeenCalled();
      expect(artistRepo.save).not.toHaveBeenCalled();
      expect(discRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ artist: existingArtist }),
      );
      expect(request.status).toBe(RequestStatus.APPROVED);
      expect(requestRepo.save).toHaveBeenCalledWith(request);
    },
  );

  it('creates a missing Artist with the normalized key and preserves its visible name and relations', async () => {
    const artistName = '  Björk  +  Co  ';
    const request = requestFixture({
      id: 'request-id',
      artistName,
      discName: 'Requested Record',
      status: RequestStatus.PENDING,
      country: Object.assign(new Country(), { id: 'country-id' }),
      genre: Object.assign(new Genre(), { id: 'genre-id' }),
    });
    const artist = Object.assign(new Artist(), {
      id: 'artist-id',
      name: artistName,
    });
    const disc = Object.assign(new Disc(), { id: 'disc-id', artist });
    const requestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest
        .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
        .mockResolvedValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockImplementation(async (saved) => saved),
    });
    const artistRepo = repositoryMock(Artist, {
      findOne: jest
        .fn<Promise<Artist | null>, [FindOneOptions<Artist>]>()
        .mockResolvedValue(null),
      create: jest.fn<Artist, [DeepPartial<Artist>]>().mockReturnValue(artist),
      save: jest.fn<Promise<Artist>, [Artist]>().mockResolvedValue(artist),
    });
    const discRepo = repositoryMock(Disc, {
      create: jest.fn<Disc, [DeepPartial<Disc>]>().mockReturnValue(disc),
      save: jest.fn<Promise<Disc>, [Disc]>().mockResolvedValue(disc),
    });
    const service = createService(requestRepo, artistRepo, discRepo);

    await expect(service.approve(request.id)).resolves.toBe(disc);
    expect(artistRepo.findOne).toHaveBeenCalledWith({
      where: { nameNormalized: 'bjork co' },
    });
    expect(artistRepo.create).toHaveBeenCalledWith({
      name: artistName,
      nameNormalized: 'bjork co',
      countryId: request.country.id,
    });
    expect(artistRepo.save).toHaveBeenCalledWith(artist);
    expect(discRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ artist, genre: request.genre }),
    );
    expect(discRepo.save).toHaveBeenCalledWith(disc);
    expect(request.status).toBe(RequestStatus.APPROVED);
    expect(requestRepo.save).toHaveBeenCalledWith(request);
  });
});
