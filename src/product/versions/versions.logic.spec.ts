import { Test, TestingModule } from '@nestjs/testing';
import { VersionsService } from './versions.service';
import { Version, VersionStatus } from './entities/version.entity';
import { VersionItem, DevState } from './entities/version-item.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

describe('VersionsService Logic', () => {
  let service: VersionsService;
  let versionsRepoMock: any;
  let itemsRepoMock: any;

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
    versionsRepoMock.findOne.mockResolvedValue({
      status: VersionStatus.EN_DESARROLLO,
    });

    await expect(service.create({ version: '1.0.1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should not release a version with pending items', async () => {
    const version = {
      id: 'v1',
      status: VersionStatus.EN_DESARROLLO,
      items: [{ id: 'i1', state: DevState.TODO }],
    };
    versionsRepoMock.findOne.mockResolvedValue(version);

    await expect(
      service.update('v1', { status: VersionStatus.EN_PRODUCCION }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not delete a production version', async () => {
    const version = {
      id: 'v1',
      status: VersionStatus.EN_PRODUCCION,
    };
    versionsRepoMock.findOne.mockResolvedValue(version);

    await expect(service.remove('v1')).rejects.toThrow(BadRequestException);
  });

  it('should create an independent item with TODO state', async () => {
    const dto = {
      type: 'feat',
      description: 'Independent item',
      branch: 'feat/independent',
      state: DevState.IN_PROGRESS, // Should be ignored/overridden if logic enforces TODO
    } as any;

    itemsRepoMock.create.mockImplementation((item) => item);
    itemsRepoMock.save.mockImplementation((item) =>
      Promise.resolve({ ...item, id: 'i1' }),
    );

    const result = await service.createItem(dto);

    expect(result.version).toBeNull();
    expect(result.state).toBe(DevState.TODO);
  });

  it('should list independent items', async () => {
    itemsRepoMock.find.mockResolvedValue([{ id: 'i1', version: null }]);
    const result = await service.listIndependentItems();
    expect(result).toHaveLength(1);
    expect(itemsRepoMock.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { version: expect.anything() } }),
    );
  });

  it('should not allow updating state of independent item', async () => {
    const item = { id: 'i1', version: null, state: DevState.TODO };
    itemsRepoMock.findOne.mockResolvedValue(item);

    await expect(
      service.updateItem('i1', { state: DevState.IN_PROGRESS }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reset state to TODO when unassigning version', async () => {
    const item = {
      id: 'i1',
      version: { id: 'v1' },
      state: DevState.IN_PROGRESS,
    };
    itemsRepoMock.findOne.mockResolvedValue(item);
    itemsRepoMock.save.mockImplementation((i) => Promise.resolve(i));

    const result = await service.updateItem('i1', { version: null });

    expect(result.version).toBeNull();
    expect(result.state).toBe(DevState.TODO);
  });
});
