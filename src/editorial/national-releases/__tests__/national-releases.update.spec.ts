import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';
import { MailService } from 'src/communications/mail/mail.service';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { NationalRelease, DiscType } from '../entities/national-release.entity';
import { NationalReleasesService } from '../national-releases.service';

describe('NationalReleasesService duplicate handling', () => {
  let moduleRef: TestingModule;
  let service: NationalReleasesService;
  let releaseRepository: {
    findOneBy: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let discRepository: { findOne: jest.Mock };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  };

  const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
  const otherId = 'b0fe4ce5-576f-4a1d-890b-b36a1ce8f9e3';
  const release: NationalRelease = {
    id,
    artistName: 'Artist',
    discName: 'Album',
    discType: DiscType.ALBUM,
    genre: 'Rock',
    releaseDay: new Date('2026-10-20'),
    publishAt: null,
    link: null,
    approved: false,
    discId: null,
    disc: null,
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  };
  const duplicateMessage = 'Novedad duplicada: Artist – Album';

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn(),
      andWhere: jest.fn(),
      getOne: jest.fn(),
    };
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    releaseRepository = {
      findOneBy: jest.fn().mockResolvedValue({ ...release }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    discRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: '8df8fec1-94a5-449b-a1f3-746226f0ed67',
        name: 'Album',
        ep: false,
        link: null,
        artist: { name: 'Artist' },
        genre: { name: 'Rock' },
      }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        NationalReleasesService,
        {
          provide: getRepositoryToken(NationalRelease),
          useValue: releaseRepository,
        },
        { provide: getRepositoryToken(Disc), useValue: discRepository },
        {
          provide: MailService,
          useValue: { sendNationalReleaseNotification: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(NationalReleasesService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('updates an unchanged key while excluding the current release ID', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    await expect(service.update(id, {})).resolves.toEqual(release);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('r.id != :excludeId', {
      excludeId: id,
    });
    expect(releaseRepository.save).toHaveBeenCalledWith(release);
  });

  it('updates to an available key', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    const updatedRelease = { ...release, artistName: 'New Artist' };

    await expect(
      service.update(id, { artistName: 'New Artist' }),
    ).resolves.toEqual(updatedRelease);

    expect(releaseRepository.save).toHaveBeenCalledWith(updatedRelease);
  });

  it('returns the existing duplicate 400 for a case-insensitive conflict on another ID', async () => {
    queryBuilder.getOne.mockResolvedValue({ ...release, id: otherId });
    const update = service.update(id, {
      artistName: 'ARTIST',
      discName: 'ALBUM',
    });

    await expect(update).rejects.toBeInstanceOf(BadRequestException);
    await expect(update).rejects.toThrow('Novedad duplicada: ARTIST – ALBUM');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('r.id != :excludeId', {
      excludeId: id,
    });
    expect(releaseRepository.save).not.toHaveBeenCalled();
  });

  it('translates a race that violates the National Release unique index', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      table: 'national_release',
      constraint: 'UQ_national_release_artist_disc_type',
    });
    releaseRepository.save.mockRejectedValue(
      new QueryFailedError('UPDATE national_release', [], driverError),
    );

    const update = service.update(id, {});
    await expect(update).rejects.toBeInstanceOf(BadRequestException);
    await expect(update).rejects.toThrow(duplicateMessage);
  });

  it('preserves unrelated persistence errors', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    const error = new Error('connection lost');
    releaseRepository.save.mockRejectedValue(error);

    await expect(service.update(id, {})).rejects.toBe(error);
  });

  it('keeps create duplicate checks and error behavior unchanged', async () => {
    queryBuilder.getOne.mockResolvedValue({ ...release, id: otherId });

    const create = service.create({
      artistName: 'ARTIST',
      discName: 'ALBUM',
      discType: DiscType.ALBUM,
      genre: 'Rock',
      releaseDay: '2026-10-20',
    });
    await expect(create).rejects.toBeInstanceOf(BadRequestException);
    await expect(create).rejects.toThrow('Novedad duplicada: ARTIST – ALBUM');

    expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
      'r.id != :excludeId',
      expect.anything(),
    );
    expect(releaseRepository.save).not.toHaveBeenCalled();
  });

  it('keeps createFromDisc duplicate checks and error behavior unchanged', async () => {
    queryBuilder.getOne.mockResolvedValue({ ...release, id: otherId });

    const createFromDisc = service.createFromDisc({
      discId: '8df8fec1-94a5-449b-a1f3-746226f0ed67',
      releaseDay: '2026-10-20',
    });
    await expect(createFromDisc).rejects.toBeInstanceOf(BadRequestException);
    await expect(createFromDisc).rejects.toThrow(duplicateMessage);

    expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
      'r.id != :excludeId',
      expect.anything(),
    );
    expect(releaseRepository.save).not.toHaveBeenCalled();
  });
});
