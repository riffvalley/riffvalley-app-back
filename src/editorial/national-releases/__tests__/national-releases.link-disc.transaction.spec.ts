import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { MailService } from 'src/communications/mail/mail.service';
import { NationalRelease, DiscType } from '../entities/national-release.entity';
import { NationalReleasesService } from '../national-releases.service';

describe('NationalReleasesService linkDisc transaction', () => {
  let moduleRef: TestingModule;
  let service: NationalReleasesService;
  let releaseRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let discRepository: { findOne: jest.Mock; save: jest.Mock };
  let transactionDiscRepository: { create: jest.Mock; save: jest.Mock };
  let transactionReleaseRepository: { save: jest.Mock };
  let transactionManager: { getRepository: jest.Mock };
  let stagedDiscs: unknown[];

  const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
  const discId = '8df8fec1-94a5-449b-a1f3-746226f0ed67';
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
  const newDisc = {
    id: discId,
    name: 'New album',
    artist: { id: 'c277a839-1f28-48f6-89b9-acef6d0938d9' },
    genre: { id: '41ea9445-7e3f-4265-b82c-32737155017d' },
    ep: false,
    debut: true,
    link: null,
    image: null,
  };

  beforeEach(async () => {
    stagedDiscs = [];
    transactionDiscRepository = {
      create: jest.fn().mockReturnValue(newDisc),
      save: jest.fn().mockImplementation(async (disc) => {
        stagedDiscs.push(disc);
        return newDisc;
      }),
    };
    transactionReleaseRepository = { save: jest.fn() };
    transactionManager = {
      getRepository: jest.fn((entity) =>
        entity === Disc
          ? transactionDiscRepository
          : transactionReleaseRepository,
      ),
    };
    releaseRepository = {
      findOne: jest.fn().mockResolvedValue({ ...release }),
      save: jest.fn().mockImplementation(async (entity) => entity),
      manager: {
        transaction: jest.fn(async (operation) => {
          try {
            const result = await operation(transactionManager);
            return result;
          } catch (error) {
            stagedDiscs = [];
            throw error;
          }
        }),
      },
    };
    discRepository = { findOne: jest.fn(), save: jest.fn() };

    moduleRef = await Test.createTestingModule({
      providers: [
        NationalReleasesService,
        {
          provide: getRepositoryToken(NationalRelease),
          useValue: releaseRepository,
        },
        { provide: getRepositoryToken(Disc), useValue: discRepository },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(NationalReleasesService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('rejects a missing link option before looking up the release', async () => {
    await expect(service.linkDisc(id, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(releaseRepository.findOne).not.toHaveBeenCalled();
    expect(releaseRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('rejects both link options before looking up the release', async () => {
    await expect(
      service.linkDisc(id, { discId, name: 'New album' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(releaseRepository.findOne).not.toHaveBeenCalled();
    expect(releaseRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('rejects new Disc attributes without a Disc name', async () => {
    await expect(
      service.linkDisc(id, { artistId: newDisc.artist.id }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(releaseRepository.findOne).not.toHaveBeenCalled();
    expect(releaseRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('creates the Disc and links it through repositories from one transaction', async () => {
    transactionReleaseRepository.save.mockImplementation(
      async (entity) => entity,
    );

    const result = await service.linkDisc(id, {
      name: 'New album',
      artistId: newDisc.artist.id,
      genreId: newDisc.genre.id,
      ep: false,
      debut: true,
      link: null,
      image: null,
    });

    expect(result.disc).toBe(newDisc);
    expect(releaseRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionManager.getRepository).toHaveBeenCalledTimes(2);
    expect(transactionDiscRepository.create).toHaveBeenCalledWith({
      name: 'New album',
      artist: { id: newDisc.artist.id },
      genre: { id: newDisc.genre.id },
      ep: false,
      debut: true,
      link: null,
      image: null,
    });
    expect(transactionDiscRepository.save).toHaveBeenCalledTimes(1);
    expect(transactionReleaseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id, disc: newDisc }),
    );
    expect(transactionReleaseRepository.save).toHaveBeenCalledTimes(1);
    expect(releaseRepository.save).not.toHaveBeenCalled();
    expect(discRepository.save).not.toHaveBeenCalled();
    expect(stagedDiscs).toHaveLength(1);
  });

  it('rolls back the newly created Disc when saving the release fails', async () => {
    const error = new Error('release write failed');
    transactionReleaseRepository.save.mockRejectedValue(error);

    await expect(service.linkDisc(id, { name: 'New album' })).rejects.toBe(
      error,
    );

    expect(releaseRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDiscRepository.save).toHaveBeenCalledTimes(1);
    expect(transactionReleaseRepository.save).toHaveBeenCalledTimes(1);
    expect(stagedDiscs).toHaveLength(0);
    expect(releaseRepository.save).not.toHaveBeenCalled();
    expect(discRepository.save).not.toHaveBeenCalled();
  });

  it('keeps linking an existing Catalog Disc outside the create transaction', async () => {
    const existingDisc = { id: discId, name: 'Existing album' };
    discRepository.findOne.mockResolvedValue(existingDisc);
    releaseRepository.save.mockImplementation(async (entity) => entity);

    const result = await service.linkDisc(id, { discId });

    expect(result.disc).toBe(existingDisc);
    expect(discRepository.findOne).toHaveBeenCalledWith({
      where: { id: discId },
      relations: ['artist', 'genre'],
    });
    expect(releaseRepository.manager.transaction).not.toHaveBeenCalled();
    expect(releaseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id, disc: existingDisc }),
    );
    expect(releaseRepository.save).toHaveBeenCalledTimes(1);
    expect(transactionDiscRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the not-found error when an existing Catalog Disc is absent', async () => {
    discRepository.findOne.mockResolvedValue(null);

    await expect(service.linkDisc(id, { discId })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(releaseRepository.manager.transaction).not.toHaveBeenCalled();
    expect(releaseRepository.save).not.toHaveBeenCalled();
  });
});
