import { getMetadataArgsStorage } from 'typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { User } from 'src/auth/entities/user.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { DiscRequest, RequestStatus } from './entities/disc-request.entity';
import { RequestsService } from './requests.service';

describe('RequestsService characterization', () => {
  it('preserves eager request relations and createdAt-descending read order', async () => {
    const relations = getMetadataArgsStorage().relations.filter(
      (relation) => relation.target === DiscRequest,
    );
    const userRelation = relations.find((relation) => relation.propertyName === 'user');
    const genreRelation = relations.find((relation) => relation.propertyName === 'genre');
    const countryRelation = relations.find((relation) => relation.propertyName === 'country');
    const inverseRequests = getMetadataArgsStorage().relations.find(
      (relation) => relation.target === User && relation.propertyName === 'requests',
    );
    const eagerPayload = {
      id: 'request-id',
      user: { id: 'user-id' },
      genre: { id: 'genre-id' },
      country: { id: 'country-id' },
    };
    const requestRepo = {
      find: jest.fn().mockResolvedValue([eagerPayload]),
    };
    const service = new RequestsService(requestRepo as any, {} as any, {} as any, {} as any, {} as any);

    expect(userRelation).toMatchObject({ relationType: 'many-to-one', options: { eager: true } });
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
    expect(requestRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    await expect(service.findByUser({ id: 'user-id' } as User)).resolves.toEqual([eagerPayload]);
    expect(requestRepo.find).toHaveBeenLastCalledWith({
      where: { user: { id: 'user-id' } },
      order: { createdAt: 'DESC' },
    });
  });

  it('creates a request linked to the authenticated user and optional Catalog references', async () => {
    const user = { id: 'user-id' } as User;
    const dto = {
      discName: 'Record',
      artistName: 'Band',
      genreId: 'genre-id',
      countryId: 'country-id',
    } as CreateRequestDto;
    const request = { ...dto, user };
    const requestRepo = {
      create: jest.fn().mockReturnValue(request),
      save: jest.fn().mockResolvedValue(request),
    };
    const service = new RequestsService(requestRepo as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.create(dto, user)).resolves.toBe(request);
    expect(requestRepo.create).toHaveBeenCalledWith({
      ...dto,
      user,
      genre: { id: 'genre-id' },
      country: { id: 'country-id' },
    });
    expect(requestRepo.save).toHaveBeenCalledWith(request);
  });

  it('approves a pending request by materializing Artist and Disc through Catalog repositories', async () => {
    const request = {
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
      genre: { id: 'genre-id' } as Genre,
      country: { id: 'country-id' } as Country,
    } as DiscRequest;
    const artist = { id: 'artist-id', name: request.artistName } as Artist;
    const disc = { id: 'disc-id', name: request.discName, artist } as Disc;
    const requestRepo = {
      findOneBy: jest.fn().mockResolvedValue(request),
      save: jest.fn().mockImplementation(async (saved) => saved),
    };
    const artistRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(artist),
      save: jest.fn().mockResolvedValue(artist),
    };
    const discRepo = {
      create: jest.fn().mockReturnValue(disc),
      save: jest.fn().mockResolvedValue(disc),
    };
    const service = new RequestsService(
      requestRepo as any,
      artistRepo as any,
      discRepo as any,
      {} as any,
      {} as any,
    );

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

    await expect(service.approve(request.id)).rejects.toThrow('Esta petición ya fue procesada');
    expect(artistRepo.findOne).toHaveBeenCalledTimes(1);
    expect(discRepo.save).toHaveBeenCalledTimes(1);
  });
});
