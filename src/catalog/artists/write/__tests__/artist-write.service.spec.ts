import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from '../../entities/artist.entity';
import { CreateArtistDto } from '../../dto/create-artist.dto';
import { UpdateArtistDto } from '../../dto/update-artist.dto';
import { ArtistWriteService } from '../artist-write.service';

describe('ArtistWriteService', () => {
  const artistRepository = {
    create: jest.fn(),
    save: jest.fn(),
    preload: jest.fn(),
    delete: jest.fn(),
  };
  let service: ArtistWriteService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        ArtistWriteService,
        { provide: getRepositoryToken(Artist), useValue: artistRepository },
      ],
    }).compile();
    service = moduleRef.get(ArtistWriteService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('creates with normalized name and needsReview=true and returns the saved entity', async () => {
    const dto = {
      name: '  Björk + Co  ',
      description: 'Description',
      image: 'image.png',
      countryId: 'country-id',
    };
    const entity = { ...dto, nameNormalized: 'bjork co', needsReview: true };
    const saved = { ...entity, country: { id: 'country-id', name: 'Iceland' } };
    artistRepository.create.mockReturnValue(entity);
    artistRepository.save.mockResolvedValue(saved);

    await expect(
      service.create(Object.assign(new CreateArtistDto(), dto)),
    ).resolves.toBe(saved);
    expect(artistRepository.create).toHaveBeenCalledWith({
      ...dto,
      nameNormalized: 'bjork co',
      needsReview: true,
    });
    expect(artistRepository.save).toHaveBeenCalledWith(entity);
  });

  it('maps create 23505 to BadRequestException with the database detail', async () => {
    artistRepository.create.mockReturnValue({ name: 'duplicate' });
    artistRepository.save.mockRejectedValue({
      code: '23505',
      detail: 'duplicate artist name',
    });
    await expect(
      service.create(
        Object.assign(new CreateArtistDto(), { name: 'duplicate' }),
      ),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      message: 'duplicate artist name',
    });
  });

  it('maps other create persistence errors to the current 500 response', async () => {
    artistRepository.create.mockReturnValue({ name: 'Artist' });
    artistRepository.save.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.create(Object.assign(new CreateArtistDto(), { name: 'Artist' })),
    ).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      message: 'ayuda',
    });
  });

  it('preloads updates with normalized name, Country relation, and needsReview=false', async () => {
    const artist = {
      id: 'artist-id',
      name: 'Björk',
      country: { id: 'country-id' },
      needsReview: false,
    };
    artistRepository.preload.mockResolvedValue(artist);
    artistRepository.save.mockResolvedValue({ ignored: 'return value' });

    await expect(
      service.update(
        'artist-id',
        Object.assign(new UpdateArtistDto(), {
          name: 'Björk',
          countryId: 'country-id',
          description: 'Bio',
        }),
      ),
    ).resolves.toBe(artist);
    expect(artistRepository.preload).toHaveBeenCalledWith({
      id: 'artist-id',
      description: 'Bio',
      name: 'Björk',
      nameNormalized: 'bjork',
      country: { id: 'country-id' },
      needsReview: false,
    });
    expect(artistRepository.save).toHaveBeenCalledWith(artist);
  });

  it('leaves name normalization absent and an empty countryId does not clear Country', async () => {
    const artist = {
      id: 'artist-id',
      name: 'Original',
      country: { id: 'old-country' },
    };
    artistRepository.preload.mockResolvedValue(artist);
    artistRepository.save.mockResolvedValue(artist);

    await service.update(
      'artist-id',
      Object.assign(new UpdateArtistDto(), { countryId: '' }),
    );
    expect(artistRepository.preload).toHaveBeenCalledWith({
      id: 'artist-id',
      country: undefined,
      needsReview: false,
    });
  });

  it('throws 404 when update preload misses and maps save 23505 failures', async () => {
    artistRepository.preload.mockResolvedValue(undefined);
    await expect(
      service.update('missing', new UpdateArtistDto()),
    ).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'Artist with id missing not found',
    });

    artistRepository.preload.mockResolvedValue({ id: 'artist-id' });
    artistRepository.save.mockRejectedValue({
      code: '23505',
      detail: 'conflict',
    });
    await expect(
      service.update('artist-id', new UpdateArtistDto()),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      message: 'conflict',
    });
  });

  it('returns TypeORM DeleteResult unchanged, including zero affected rows', async () => {
    const deleteResult = { affected: 0, raw: [] };
    artistRepository.delete.mockResolvedValue(deleteResult);
    await expect(service.remove('missing')).resolves.toBe(deleteResult);
    expect(artistRepository.delete).toHaveBeenCalledWith({ id: 'missing' });
  });
});
