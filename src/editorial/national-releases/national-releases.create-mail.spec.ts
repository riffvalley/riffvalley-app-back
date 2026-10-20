import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../../communications/mail/mail.service';
import { Disc } from '../../catalog/discs/entities/disc.entity';
import { NationalRelease, DiscType } from './entities/national-release.entity';
import { NationalReleasesService } from './national-releases.service';

describe('NationalReleasesService create mail contract', () => {
  let moduleRef: TestingModule;
  let service: NationalReleasesService;
  const dto = {
    artistName: 'Artist',
    discName: 'Album',
    discType: DiscType.ALBUM,
    genre: 'Rock',
    releaseDay: '2026-10-14',
    link: 'https://example.test/album',
  };
  const savedRelease: NationalRelease = {
    id: 'e77bcfc3-c8ae-4d21-8814-9381b97bd3dc',
    ...dto,
    releaseDay: new Date(dto.releaseDay),
    publishAt: null,
    approved: false,
    discId: null,
    disc: null,
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  };
  const getOne = jest.fn().mockResolvedValue(null);
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne,
  };
  const releaseRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    create: jest.fn().mockReturnValue(savedRelease),
    save: jest.fn().mockResolvedValue(savedRelease),
  };
  const mailService = { sendNationalReleaseNotification: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    getOne.mockResolvedValue(null);
    releaseRepository.create.mockReturnValue(savedRelease);
    releaseRepository.save.mockResolvedValue(savedRelease);
    moduleRef = await Test.createTestingModule({
      providers: [
        NationalReleasesService,
        {
          provide: getRepositoryToken(NationalRelease),
          useValue: releaseRepository,
        },
        { provide: getRepositoryToken(Disc), useValue: {} },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(NationalReleasesService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('saves the release and sends the original editorial data to Mail', async () => {
    await expect(service.create(dto)).resolves.toBe(savedRelease);

    expect(releaseRepository.save).toHaveBeenCalledWith(savedRelease);
    expect(mailService.sendNationalReleaseNotification).toHaveBeenCalledWith(
      dto,
    );
  });
});
