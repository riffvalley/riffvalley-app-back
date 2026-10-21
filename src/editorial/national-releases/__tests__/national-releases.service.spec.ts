import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { MailService } from 'src/communications/mail/mail.service';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { NationalRelease, DiscType } from '../entities/national-release.entity';
import { NationalReleasesService } from '../national-releases.service';

describe('NationalReleasesService public detail', () => {
  let moduleRef: TestingModule;
  let service: NationalReleasesService;
  let nationalReleaseRepository: jest.Mocked<
    Pick<Repository<NationalRelease>, 'findOne' | 'findOneBy'>
  >;

  const id = 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc';
  const release: NationalRelease = {
    id,
    artistName: 'Artist',
    discName: 'Album',
    discType: DiscType.ALBUM,
    genre: 'Rock',
    releaseDay: new Date('2026-10-20'),
    publishAt: null,
    link: null,
    approved: true,
    discId: null,
    disc: null,
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        NationalReleasesService,
        {
          provide: getRepositoryToken(NationalRelease),
          useValue: { findOne: jest.fn(), findOneBy: jest.fn() },
        },
        { provide: getRepositoryToken(Disc), useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(NationalReleasesService);
    nationalReleaseRepository = moduleRef.get<
      jest.Mocked<Pick<Repository<NationalRelease>, 'findOne' | 'findOneBy'>>
    >(getRepositoryToken(NationalRelease));
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('looks up public detail by ID and approved status and returns the entity unchanged', async () => {
    nationalReleaseRepository.findOne.mockResolvedValue(release);

    await expect(service.findOnePublic(id)).resolves.toBe(release);
    expect(nationalReleaseRepository.findOne).toHaveBeenCalledWith({
      where: { id, approved: true },
    });
  });

  it('returns 404 when the public detail is pending or absent', async () => {
    nationalReleaseRepository.findOne.mockResolvedValue(null);

    await expect(service.findOnePublic(id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(nationalReleaseRepository.findOne).toHaveBeenCalledWith({
      where: { id, approved: true },
    });
  });

  it('keeps the internal lookup available for pending editorial operations', async () => {
    const pendingRelease = { ...release, approved: false };
    nationalReleaseRepository.findOneBy.mockResolvedValue(pendingRelease);

    await expect(service.findOne(id)).resolves.toBe(pendingRelease);
    expect(nationalReleaseRepository.findOneBy).toHaveBeenCalledWith({ id });
  });
});
