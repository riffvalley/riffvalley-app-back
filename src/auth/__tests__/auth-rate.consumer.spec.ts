import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthModule } from '../auth.module';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { UserAccessLog } from '../entities/user-access-log.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { RatesModule } from 'src/community/rates/rates.module';
import { CatalogModule } from 'src/catalog/catalog.module';

describe('Auth → Rate consumer characterization', () => {
  let moduleRef: TestingModule;
  const rateRepository = {
    findAndCount: jest.fn(),
    find: jest.fn(),
  };
  const userRepository = {};
  const accessLogRepository = { find: jest.fn() };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(getRepositoryToken(Rate)).useValue(rateRepository)
      .overrideProvider(getRepositoryToken(User)).useValue(userRepository)
      .overrideProvider(getRepositoryToken(UserAccessLog)).useValue(accessLogRepository)
      .overrideProvider(ConfigService).useValue({ get: () => 'auth-rate-test-secret' })
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  beforeEach(() => jest.clearAllMocks());

  it('registers Rate in AuthModule and injects its repository into AuthService', () => {
    expect(moduleRef.get(getRepositoryToken(Rate))).toBe(rateRepository);
    expect((moduleRef.get(AuthService) as any).rateRepository).toBe(rateRepository);
  });

  it('preserves Rate based activity queries and their observable projections', async () => {
    const createdAt = new Date('2025-03-04T12:00:00.000Z');
    const rate = {
      id: 'rate-1', rate: 8, cover: 7, createdAt, editedAt: null,
      user: { id: 'user-1', username: 'listener', image: 'user.png' },
      disc: { id: 'disc-1', name: 'Record', artist: { name: 'Band' } },
    };
    rateRepository.findAndCount.mockResolvedValue([[rate], 1]);
    rateRepository.find.mockResolvedValue([rate]);
    accessLogRepository.find.mockResolvedValue([{ date: createdAt }]);
    const service = moduleRef.get(AuthService);

    await expect(service.getAllActivity({ limit: 10, offset: 0 } as any)).resolves.toEqual({
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      limit: 10,
      data: [{
        id: 'rate-1', rate: 8, cover: 7, createdAt, editedAt: null,
        user: { id: 'user-1', username: 'listener', image: 'user.png' },
        disc: { id: 'disc-1', name: 'Record' },
      }],
    });
    expect(rateRepository.findAndCount).toHaveBeenCalledWith({
      relations: ['disc', 'user'],
      order: { createdAt: 'DESC' },
      take: 10,
      skip: 0,
    });

    await expect(service.getUserActivity('user-1')).resolves.toEqual({
      votes: [rate],
      logins: [{ date: createdAt }],
    });
    expect(rateRepository.find).toHaveBeenCalledWith({
      where: { user: { id: 'user-1' } },
      relations: ['disc'],
      order: { createdAt: 'DESC' },
      select: { id: true, rate: true, cover: true, createdAt: true, editedAt: true },
    });
    expect(accessLogRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { date: 'DESC' },
      select: { date: true },
    });
  });

  it('keeps the previous module direction without adding duplicates or a cycle', () => {
    const authImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) as unknown[];
    const ratesImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, RatesModule) as unknown[];
    const catalogImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CatalogModule) as unknown[];
    expect(authImports).not.toContain(RatesModule);
    expect(ratesImports).toContain(AuthModule);
    expect(catalogImports).toContain(AuthModule);
    expect(catalogImports).not.toContain(RatesModule);
  });
});
