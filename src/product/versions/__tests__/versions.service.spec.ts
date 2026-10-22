import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Version, VersionStatus } from '../entities/version.entity';
import { VersionItem } from '../entities/version-item.entity';
import { VersionsService } from '../versions.service';

type VersionsRepository = Pick<
  Repository<Version>,
  'create' | 'find' | 'findOne' | 'findAndCount' | 'save' | 'remove'
>;

type VersionItemsRepository = Pick<
  Repository<VersionItem>,
  'create' | 'find' | 'findOne' | 'save' | 'remove'
>;

describe('VersionsService', () => {
  let service: VersionsService;
  let versionsRepository: jest.Mocked<VersionsRepository>;

  beforeEach(async () => {
    versionsRepository = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const versionItemsRepository: jest.Mocked<VersionItemsRepository> = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionsService,
        { provide: getRepositoryToken(Version), useValue: versionsRepository },
        {
          provide: getRepositoryToken(VersionItem),
          useValue: versionItemsRepository,
        },
      ],
    }).compile();

    service = module.get<VersionsService>(VersionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uses the Version repository for findAll', async () => {
    const versions: Version[] = [];
    versionsRepository.find.mockResolvedValue(versions);

    await expect(service.findAll()).resolves.toBe(versions);
    expect(versionsRepository.find).toHaveBeenCalledWith({
      order: { releaseDate: 'DESC', createdAt: 'DESC' },
    });
  });

  it('updates publishedAt using the existing date conversion', async () => {
    const version: Version = {
      id: 'v1',
      version: '1.0.0',
      releaseDate: undefined,
      notes: undefined,
      link: undefined,
      items: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      isActive: false,
      publishedAt: undefined,
      status: VersionStatus.EN_DESARROLLO,
    };
    versionsRepository.findOne.mockResolvedValue(version);

    await service.update('v1', { publishedAt: '2026-10-22T12:30:00.000Z' });

    expect(version.publishedAt).toEqual(new Date('2026-10-22T12:30:00.000Z'));
    expect(versionsRepository.save).toHaveBeenCalledWith(version);
  });
});
