import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { VersionsService } from '../versions.service';
import { Version, VersionStatus } from '../entities/version.entity';
import {
  ChangeType,
  VersionItem,
  DevState,
} from '../entities/version-item.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CreateVersionItemDto } from '../dto/create-version-item.dto';

type VersionsRepository = Pick<
  Repository<Version>,
  'create' | 'save' | 'findOne' | 'find' | 'remove'
>;

type VersionItemsRepository = Pick<
  Repository<VersionItem>,
  'create' | 'save' | 'findOne' | 'find' | 'remove'
>;

describe('VersionsService Logic', () => {
  let service: VersionsService;
  let versionsRepoMock: jest.Mocked<VersionsRepository>;
  let itemsRepoMock: jest.Mocked<VersionItemsRepository>;

  beforeEach(async () => {
    versionsRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
    };
    itemsRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionsService,
        {
          provide: getRepositoryToken(Version),
          useValue: versionsRepoMock,
        },
        {
          provide: getRepositoryToken(VersionItem),
          useValue: itemsRepoMock,
        },
      ],
    }).compile();

    service = module.get<VersionsService>(VersionsService);
  });

  it('should not create a new version if one is already in development', async () => {
    versionsRepoMock.findOne.mockResolvedValue(
      Object.assign(new Version(), {
        status: VersionStatus.EN_DESARROLLO,
      }),
    );

    await expect(service.create({ version: '1.0.1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should not release a version with pending items', async () => {
    const version = Object.assign(new Version(), {
      id: 'v1',
      status: VersionStatus.EN_DESARROLLO,
      items: [
        Object.assign(new VersionItem(), { id: 'i1', state: DevState.TODO }),
      ],
    });
    versionsRepoMock.findOne.mockResolvedValue(version);

    await expect(
      service.update('v1', { status: VersionStatus.EN_PRODUCCION }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not delete a production version', async () => {
    const version = Object.assign(new Version(), {
      id: 'v1',
      status: VersionStatus.EN_PRODUCCION,
    });
    versionsRepoMock.findOne.mockResolvedValue(version);

    await expect(service.remove('v1')).rejects.toThrow(BadRequestException);
  });

  it('should create an independent item with TODO state', async () => {
    const dto: CreateVersionItemDto = {
      type: ChangeType.FEAT,
      description: 'Independent item',
      branch: 'feat/independent',
      state: DevState.IN_PROGRESS, // Should be ignored/overridden if logic enforces TODO
    };

    itemsRepoMock.create.mockImplementation((item) =>
      Object.assign(new VersionItem(), item),
    );
    itemsRepoMock.save.mockImplementation(async (item) =>
      Object.assign(new VersionItem(), item, { id: 'i1' }),
    );

    const result = await service.createItem(dto);

    expect(result.version).toBeNull();
    expect(result.state).toBe(DevState.TODO);
  });

  it('should list independent items', async () => {
    itemsRepoMock.find.mockResolvedValue([
      Object.assign(new VersionItem(), { id: 'i1', version: null }),
    ]);
    const result = await service.listIndependentItems();
    expect(result).toHaveLength(1);
    expect(itemsRepoMock.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { version: expect.anything() } }),
    );
  });

  it('should not allow updating state of independent item', async () => {
    const item = Object.assign(new VersionItem(), {
      id: 'i1',
      version: null,
      state: DevState.TODO,
    });
    itemsRepoMock.findOne.mockResolvedValue(item);

    await expect(
      service.updateItem('i1', { state: DevState.IN_PROGRESS }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reset state to TODO when unassigning version', async () => {
    const item = Object.assign(new VersionItem(), {
      id: 'i1',
      version: Object.assign(new Version(), { id: 'v1' }),
      state: DevState.IN_PROGRESS,
    });
    itemsRepoMock.findOne.mockResolvedValue(item);
    itemsRepoMock.save.mockImplementation(async (item) =>
      Object.assign(new VersionItem(), item),
    );

    const result = await service.updateItem('i1', { version: null });

    expect(result.version).toBeNull();
    expect(result.state).toBe(DevState.TODO);
  });
});
