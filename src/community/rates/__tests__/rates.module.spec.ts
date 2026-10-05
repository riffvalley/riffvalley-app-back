import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { User } from 'src/auth/entities/user.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { RatesController } from '../rates.controller';
import { RatesModule } from '../rates.module';
import { RatesService } from '../rates.service';
import { RatesStatsService } from '../stats/rates-stats.service';
import { RatesHistoryService } from '../history/rates-history.service';
import { Rate } from '../entities/rate.entity';

describe('RatesModule characterization', () => {
  let moduleRef: TestingModule;
  const rateRepository = {};
  const discRepository = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [RatesModule] })
      .overrideProvider(getRepositoryToken(Rate)).useValue(rateRepository)
      .overrideProvider(getRepositoryToken(Disc)).useValue(discRepository)
      .overrideProvider(getRepositoryToken(User)).useValue({})
      .overrideProvider(getRepositoryToken(UserAccessLog)).useValue({})
      .overrideProvider(ConfigService).useValue({ get: () => 'rates-test-secret' })
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  it('resolves the controller, services and repositories through RatesModule/AuthModule', () => {
    expect(moduleRef.get(RatesController)).toBeDefined();
    expect(moduleRef.get(RatesService)).toBeDefined();
    expect(moduleRef.get(RatesStatsService)).toBeDefined();
    expect(moduleRef.get(RatesHistoryService)).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(Rate))).toBe(rateRepository);
    expect((moduleRef.get(RatesService) as any).rateRepository).toBe(rateRepository);
    expect((moduleRef.get(RatesStatsService) as any).rateRepository).toBe(rateRepository);
    expect((moduleRef.get(RatesHistoryService) as any).rateRepository).toBe(rateRepository);
    expect(moduleRef.get(getRepositoryToken(Disc))).toBe(discRepository);
    expect((Reflect.getMetadata(MODULE_METADATA.IMPORTS, RatesModule) as unknown[])).toContain(AuthModule);
  });

  it('preserves Rate relation metadata and inverse sides', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Function, property: string) => relations.find((entry) => entry.target === target && entry.propertyName === property);
    const rateUser = relation(Rate, 'user');
    expect(rateUser).toMatchObject({ relationType: 'many-to-one', options: { eager: true, onDelete: 'CASCADE' } });
    expect((rateUser as any).inverseSideProperty({ rate: 'user.rate' })).toBe('user.rate');
    const rateDisc = relation(Rate, 'disc');
    expect(rateDisc).toMatchObject({ relationType: 'many-to-one', options: { eager: true, onDelete: 'CASCADE' } });
    expect((rateDisc as any).inverseSideProperty({ rates: 'disc.rates' })).toBe('disc.rates');
    const userRate = relation(User, 'rate');
    expect(userRate).toMatchObject({ relationType: 'one-to-many', options: { cascade: true } });
    expect((userRate as any).inverseSideProperty({ user: 'rate.user' })).toBe('rate.user');
    const discRates = relation(Disc, 'rates');
    expect(discRates).toMatchObject({ relationType: 'one-to-many' });
    expect(discRates?.options.eager).toBeUndefined();
    expect((discRates as any).inverseSideProperty({ disc: 'rate.disc' })).toBe('rate.disc');
  });
});
