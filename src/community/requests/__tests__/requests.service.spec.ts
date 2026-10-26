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
import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { CreateRequestDto } from '../dto/create-request.dto';
import { DiscRequest, RequestStatus } from '../entities/disc-request.entity';
import { RequestsService } from '../requests.service';
import { RequestsController } from '../requests.controller';

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

function transactionDataSource(
  requestRepo: Repository<DiscRequest>,
  artistRepo: Repository<Artist>,
  discRepo: Repository<Disc>,
): DataSource {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'requests-test',
  });
  const repositories = new Map<
    EntityTarget<ObjectLiteral>,
    Repository<ObjectLiteral>
  >([
    [DiscRequest, requestRepo as Repository<ObjectLiteral>],
    [Artist, artistRepo as Repository<ObjectLiteral>],
    [Disc, discRepo as Repository<ObjectLiteral>],
  ]);
  const manager = Object.assign(new EntityManager(dataSource), {
    getRepository: <T extends ObjectLiteral>(
      entity: EntityTarget<T>,
    ): Repository<T> => {
      const repository = repositories.get(entity);
      if (!repository) throw new Error('Unexpected transaction repository');
      return repository as Repository<T>;
    },
  });
  Object.assign(dataSource, {
    transaction: jest.fn(
      (run: (entityManager: EntityManager) => Promise<unknown>) => run(manager),
    ),
  });
  return dataSource;
}

function failingApprovalHarness(failingWrite: 'artist' | 'disc' | 'request') {
  const request = requestFixture({
    id: 'request-id',
    artistName: 'The Band',
    discName: 'Requested Record',
    status: RequestStatus.PENDING,
  });
  const artist = Object.assign(new Artist(), { id: 'artist-id' });
  const disc = Object.assign(new Disc(), { id: 'disc-id', artist });
  const persisted = {
    artists: 0,
    discs: 0,
    requestStatus: RequestStatus.PENDING,
  };
  const requestRepo = repositoryMock(DiscRequest, {
    findOneBy: jest
      .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
      .mockResolvedValue(request),
    save: jest
      .fn<Promise<DiscRequest>, [DiscRequest]>()
      .mockImplementation(async (saved) => {
        if (failingWrite === 'request') throw new Error('request save failed');
        persisted.requestStatus = saved.status;
        return saved;
      }),
  });
  const artistRepo = repositoryMock(Artist, {
    findOne: jest
      .fn<Promise<Artist | null>, [FindOneOptions<Artist>]>()
      .mockResolvedValue(null),
    create: jest.fn<Artist, [DeepPartial<Artist>]>().mockReturnValue(artist),
    save: jest
      .fn<Promise<Artist>, [Artist]>()
      .mockImplementation(async (saved) => {
        if (failingWrite === 'artist') throw new Error('artist save failed');
        persisted.artists += 1;
        return saved;
      }),
  });
  const discRepo = repositoryMock(Disc, {
    create: jest.fn<Disc, [DeepPartial<Disc>]>().mockReturnValue(disc),
    save: jest.fn<Promise<Disc>, [Disc]>().mockImplementation(async (saved) => {
      if (failingWrite === 'disc') throw new Error('disc save failed');
      persisted.discs += 1;
      return saved;
    }),
  });
  const dataSource = transactionDataSource(requestRepo, artistRepo, discRepo);
  const tx = dataSource.transaction;
  Object.assign(dataSource, {
    transaction: jest.fn(
      async (run: (manager: EntityManager) => Promise<unknown>) => {
        const before = { ...persisted };
        try {
          return await tx.call(dataSource, run);
        } catch (error) {
          Object.assign(persisted, before);
          throw error;
        }
      },
    ),
  });
  const externalRequestRepo = repositoryMock(DiscRequest, {
    save: jest.fn<Promise<DiscRequest>, [DiscRequest]>(),
  });
  const externalArtistRepo = repositoryMock(Artist, {
    save: jest.fn<Promise<Artist>, [Artist]>(),
  });
  const externalDiscRepo = repositoryMock(Disc, {
    save: jest.fn<Promise<Disc>, [Disc]>(),
  });
  const service = createService(
    externalRequestRepo,
    externalArtistRepo,
    externalDiscRepo,
    undefined,
    undefined,
    dataSource,
  );

  return {
    service,
    request,
    persisted,
    externalRequestRepo,
    externalArtistRepo,
    externalDiscRepo,
  };
}

function createService(
  requestRepo: Repository<DiscRequest>,
  artistRepo: Repository<Artist> = repositoryMock(Artist, {}),
  discRepo: Repository<Disc> = repositoryMock(Disc, {}),
  genreRepo: Repository<Genre> = repositoryMock(Genre, {}),
  countryRepo: Repository<Country> = repositoryMock(Country, {}),
  transactionDataSource?: DataSource,
): RequestsService {
  const repositories = new Map<
    EntityTarget<ObjectLiteral>,
    Repository<ObjectLiteral>
  >([
    [DiscRequest, requestRepo as Repository<ObjectLiteral>],
    [Artist, artistRepo as Repository<ObjectLiteral>],
    [Disc, discRepo as Repository<ObjectLiteral>],
  ]);
  const dataSource =
    transactionDataSource ??
    new DataSource({
      type: 'postgres',
      database: 'requests-test',
    });
  if (!transactionDataSource) {
    const manager = Object.assign(new EntityManager(dataSource), {
      getRepository: <T extends ObjectLiteral>(
        entity: EntityTarget<T>,
      ): Repository<T> => {
        const repository = repositories.get(entity);
        if (!repository) throw new Error('Unexpected transaction repository');
        return repository as Repository<T>;
      },
    });
    Object.assign(dataSource, {
      transaction: jest.fn(
        (run: (entityManager: EntityManager) => Promise<unknown>) =>
          run(manager),
      ),
    });
  }

  return new RequestsService(
    dataSource,
    requestRepo,
    artistRepo,
    discRepo,
    genreRepo,
    countryRepo,
  );
}

describe('RequestsService characterization', () => {
  it('counts only pending requests without loading the request list', async () => {
    const requestRepo = repositoryMock(DiscRequest, {
      count: jest
        .fn<Promise<number>, [{ where: FindOptionsWhere<DiscRequest> }]>()
        .mockResolvedValue(3),
      find: jest.fn<Promise<DiscRequest[]>, [FindManyOptions<DiscRequest>]>(),
    });
    const service = createService(requestRepo);

    await expect(service.countPendingRequests()).resolves.toBe(3);
    expect(requestRepo.count).toHaveBeenCalledWith({
      where: { status: RequestStatus.PENDING },
    });
    expect(requestRepo.find).not.toHaveBeenCalled();
  });

  it('rejects invalid create input before controller persistence can run', async () => {
    const requestRepo = repositoryMock(DiscRequest, {
      create: jest.fn<DiscRequest, [DeepPartial<DiscRequest>]>(),
      save: jest.fn<Promise<DiscRequest>, [DiscRequest]>(),
    });
    const service = createService(requestRepo);
    const controller = new RequestsController(service);
    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const user = Object.assign(new User(), { id: 'user-id' });

    await expect(
      (async () => {
        const dto = await validationPipe.transform(
          {
            discName: 'Record',
            artistName: 'Band',
            releaseDate: '2025-02-30',
          },
          {
            type: 'body',
            metatype: CreateRequestDto,
            data: undefined,
          },
        );
        return controller.create(dto, user);
      })(),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(requestRepo.create).not.toHaveBeenCalled();
    expect(requestRepo.save).not.toHaveBeenCalled();
  });

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
    const genre = Object.assign(new Genre(), { id: 'genre-id' });
    const country = Object.assign(new Country(), { id: 'country-id' });
    const dto = Object.assign(new CreateRequestDto(), {
      discName: 'Record',
      artistName: 'Band',
      releaseDate: '2025-04-02',
      genreId: 'genre-id',
      countryId: 'country-id',
    });
    const request = Object.assign(new DiscRequest(), {
      ...dto,
      releaseDate: new Date('2025-04-02T00:00:00.000Z'),
      user,
    });
    const requestRepo = repositoryMock(DiscRequest, {
      create: jest
        .fn<DiscRequest, [DeepPartial<DiscRequest>]>()
        .mockReturnValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockResolvedValue(request),
    });
    const genreRepo = repositoryMock(Genre, {
      findOneBy: jest
        .fn<Promise<Genre | null>, [FindOptionsWhere<Genre>]>()
        .mockResolvedValue(genre),
    });
    const countryRepo = repositoryMock(Country, {
      findOneBy: jest
        .fn<Promise<Country | null>, [FindOptionsWhere<Country>]>()
        .mockResolvedValue(country),
    });
    const service = createService(
      requestRepo,
      undefined,
      undefined,
      genreRepo,
      countryRepo,
    );

    await expect(service.create(dto, user)).resolves.toBe(request);
    expect(requestRepo.create).toHaveBeenCalledWith({
      ...dto,
      releaseDate: new Date('2025-04-02T00:00:00.000Z'),
      user,
      genre: { id: 'genre-id' },
      country: { id: 'country-id' },
    });
    expect(genreRepo.findOneBy).toHaveBeenCalledWith({ id: 'genre-id' });
    expect(countryRepo.findOneBy).toHaveBeenCalledWith({ id: 'country-id' });
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

  it('does not query Catalog for omitted or null relations on creation', async () => {
    const user = Object.assign(new User(), { id: 'user-id' });
    const dto = Object.assign(new CreateRequestDto(), {
      discName: 'Record',
      artistName: 'Band',
      genreId: null,
      countryId: null,
    });
    const requestRepo = repositoryMock(DiscRequest, {
      create: jest
        .fn<DiscRequest, [DeepPartial<DiscRequest>]>()
        .mockImplementation((values) =>
          Object.assign(new DiscRequest(), values),
        ),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockImplementation(async (request) => request),
    });
    const genreRepo = repositoryMock(Genre, { findOneBy: jest.fn() });
    const countryRepo = repositoryMock(Country, { findOneBy: jest.fn() });
    const service = createService(
      requestRepo,
      undefined,
      undefined,
      genreRepo,
      countryRepo,
    );

    await service.create(dto, user);

    expect(genreRepo.findOneBy).not.toHaveBeenCalled();
    expect(countryRepo.findOneBy).not.toHaveBeenCalled();
    expect(requestRepo.save).toHaveBeenCalledTimes(1);
  });

  it.each(['genre', 'country'] as const)(
    'returns 404 and performs no writes when the requested %s does not exist',
    async (reference) => {
      const user = Object.assign(new User(), { id: 'user-id' });
      const dto = Object.assign(new CreateRequestDto(), {
        discName: 'Record',
        artistName: 'Band',
        ...(reference === 'genre'
          ? { genreId: 'genre-id' }
          : { countryId: 'country-id' }),
      });
      const requestRepo = repositoryMock(DiscRequest, {
        create: jest.fn<DiscRequest, [DeepPartial<DiscRequest>]>(),
        save: jest.fn<Promise<DiscRequest>, [DiscRequest]>(),
      });
      const genreRepo = repositoryMock(Genre, {
        findOneBy: jest
          .fn<Promise<Genre | null>, [FindOptionsWhere<Genre>]>()
          .mockResolvedValue(null),
      });
      const countryRepo = repositoryMock(Country, {
        findOneBy: jest
          .fn<Promise<Country | null>, [FindOptionsWhere<Country>]>()
          .mockResolvedValue(null),
      });
      const service = createService(
        requestRepo,
        undefined,
        undefined,
        genreRepo,
        countryRepo,
      );

      await expect(service.create(dto, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(requestRepo.create).not.toHaveBeenCalled();
      expect(requestRepo.save).not.toHaveBeenCalled();
    },
  );

  it('keeps omitted update fields unchanged and skips Catalog lookups', async () => {
    const request = requestFixture({
      id: 'request-id',
      releaseDate: new Date('2025-04-02T00:00:00.000Z'),
      genre: Object.assign(new Genre(), { id: 'genre-id' }),
      country: Object.assign(new Country(), { id: 'country-id' }),
      status: RequestStatus.PENDING,
    });
    const requestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest
        .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
        .mockResolvedValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockResolvedValue(request),
    });
    const genreRepo = repositoryMock(Genre, { findOneBy: jest.fn() });
    const countryRepo = repositoryMock(Country, { findOneBy: jest.fn() });
    const service = createService(
      requestRepo,
      undefined,
      undefined,
      genreRepo,
      countryRepo,
    );
    const originalDate = request.releaseDate;
    const originalGenre = request.genre;
    const originalCountry = request.country;

    await service.update(request.id, {});

    expect(request.releaseDate).toBe(originalDate);
    expect(request.genre).toBe(originalGenre);
    expect(request.country).toBe(originalCountry);
    expect(genreRepo.findOneBy).not.toHaveBeenCalled();
    expect(countryRepo.findOneBy).not.toHaveBeenCalled();
    expect(requestRepo.save).toHaveBeenCalledWith(request);
  });

  it('clears nullable update fields without querying Catalog', async () => {
    const request = requestFixture({
      id: 'request-id',
      releaseDate: new Date('2025-04-02T00:00:00.000Z'),
      genre: Object.assign(new Genre(), { id: 'genre-id' }),
      country: Object.assign(new Country(), { id: 'country-id' }),
      status: RequestStatus.PENDING,
    });
    const requestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest
        .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
        .mockResolvedValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockResolvedValue(request),
    });
    const genreRepo = repositoryMock(Genre, { findOneBy: jest.fn() });
    const countryRepo = repositoryMock(Country, { findOneBy: jest.fn() });
    const service = createService(
      requestRepo,
      undefined,
      undefined,
      genreRepo,
      countryRepo,
    );

    await service.update(request.id, {
      releaseDate: null,
      genreId: null,
      countryId: null,
    });

    expect(request.releaseDate).toBeNull();
    expect(request.genre).toBeNull();
    expect(request.country).toBeNull();
    expect(genreRepo.findOneBy).not.toHaveBeenCalled();
    expect(countryRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('updates valid dates and existing Catalog references', async () => {
    const request = requestFixture({
      id: 'request-id',
      status: RequestStatus.PENDING,
    });
    const genre = Object.assign(new Genre(), { id: 'genre-id' });
    const country = Object.assign(new Country(), { id: 'country-id' });
    const requestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest
        .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
        .mockResolvedValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockResolvedValue(request),
    });
    const genreRepo = repositoryMock(Genre, {
      findOneBy: jest
        .fn<Promise<Genre | null>, [FindOptionsWhere<Genre>]>()
        .mockResolvedValue(genre),
    });
    const countryRepo = repositoryMock(Country, {
      findOneBy: jest
        .fn<Promise<Country | null>, [FindOptionsWhere<Country>]>()
        .mockResolvedValue(country),
    });
    const service = createService(
      requestRepo,
      undefined,
      undefined,
      genreRepo,
      countryRepo,
    );

    await service.update(request.id, {
      releaseDate: '2025-04-02T10:30:00.000Z',
      genreId: 'genre-id',
      countryId: 'country-id',
    });

    expect(request.releaseDate?.toISOString()).toBe('2025-04-02T10:30:00.000Z');
    expect(request.genre).toEqual({ id: 'genre-id' });
    expect(request.country).toEqual({ id: 'country-id' });
    expect(requestRepo.save).toHaveBeenCalledWith(request);
  });

  it('returns 404 without saving an update when a Catalog reference is missing', async () => {
    const request = requestFixture({
      id: 'request-id',
      artistName: 'Band',
      releaseDate: new Date('2025-04-02T00:00:00.000Z'),
      status: RequestStatus.PENDING,
    });
    const requestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest
        .fn<Promise<DiscRequest | null>, [FindOptionsWhere<DiscRequest>]>()
        .mockResolvedValue(request),
      save: jest
        .fn<Promise<DiscRequest>, [DiscRequest]>()
        .mockResolvedValue(request),
    });
    const genreRepo = repositoryMock(Genre, {
      findOneBy: jest
        .fn<Promise<Genre | null>, [FindOptionsWhere<Genre>]>()
        .mockResolvedValue(null),
    });
    const countryRepo = repositoryMock(Country, { findOneBy: jest.fn() });
    const originalArtistName = request.artistName;
    const originalDate = request.releaseDate;
    const service = createService(
      requestRepo,
      undefined,
      undefined,
      genreRepo,
      countryRepo,
    );

    await expect(
      service.update(request.id, {
        artistName: 'Changed Band',
        releaseDate: '2025-04-03',
        genreId: 'missing-genre-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(request.artistName).toBe(originalArtistName);
    expect(request.releaseDate).toBe(originalDate);
    expect(requestRepo.save).not.toHaveBeenCalled();
    expect(countryRepo.findOneBy).not.toHaveBeenCalled();
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

  it.each([
    ['artist', 'artist save failed'],
    ['disc', 'disc save failed'],
    ['request', 'request save failed'],
  ] as const)(
    'rolls back all approval writes when saving %s fails',
    async (failingWrite, errorMessage) => {
      const {
        service,
        request,
        persisted,
        externalRequestRepo,
        externalArtistRepo,
        externalDiscRepo,
      } = failingApprovalHarness(failingWrite);

      await expect(service.approve(request.id)).rejects.toThrow(errorMessage);

      expect(persisted).toEqual({
        artists: 0,
        discs: 0,
        requestStatus: RequestStatus.PENDING,
      });
      expect(externalRequestRepo.save).not.toHaveBeenCalled();
      expect(externalArtistRepo.save).not.toHaveBeenCalled();
      expect(externalDiscRepo.save).not.toHaveBeenCalled();
    },
  );

  it('uses only transaction-scoped repositories when approving with an existing Artist', async () => {
    const request = requestFixture({
      id: 'request-id',
      artistName: 'The Band',
      discName: 'Requested Record',
      status: RequestStatus.PENDING,
    });
    const artist = Object.assign(new Artist(), {
      id: 'existing-artist-id',
      nameNormalized: 'the band',
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
        .mockResolvedValue(artist),
      save: jest.fn<Promise<Artist>, [Artist]>(),
    });
    const discRepo = repositoryMock(Disc, {
      create: jest.fn<Disc, [DeepPartial<Disc>]>().mockReturnValue(disc),
      save: jest.fn<Promise<Disc>, [Disc]>().mockResolvedValue(disc),
    });
    const externalRequestRepo = repositoryMock(DiscRequest, {
      findOneBy: jest.fn(),
      save: jest.fn(),
    });
    const externalArtistRepo = repositoryMock(Artist, {
      findOne: jest.fn(),
      save: jest.fn(),
    });
    const externalDiscRepo = repositoryMock(Disc, {
      create: jest.fn(),
      save: jest.fn(),
    });
    const service = createService(
      externalRequestRepo,
      externalArtistRepo,
      externalDiscRepo,
      undefined,
      undefined,
      transactionDataSource(requestRepo, artistRepo, discRepo),
    );

    await expect(service.approve(request.id)).resolves.toBe(disc);

    expect(artistRepo.findOne).toHaveBeenCalledWith({
      where: { nameNormalized: 'the band' },
    });
    expect(artistRepo.save).not.toHaveBeenCalled();
    expect(discRepo.save).toHaveBeenCalledWith(disc);
    expect(requestRepo.save).toHaveBeenCalledWith(request);
    expect(externalRequestRepo.findOneBy).not.toHaveBeenCalled();
    expect(externalRequestRepo.save).not.toHaveBeenCalled();
    expect(externalArtistRepo.findOne).not.toHaveBeenCalled();
    expect(externalArtistRepo.save).not.toHaveBeenCalled();
    expect(externalDiscRepo.create).not.toHaveBeenCalled();
    expect(externalDiscRepo.save).not.toHaveBeenCalled();
  });
});
