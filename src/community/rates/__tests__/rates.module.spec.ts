import { MODULE_METADATA } from '@nestjs/common/constants';
import { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { User } from 'src/identity/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { UsersModule } from 'src/identity/users/users.module';
import { UsersService } from 'src/identity/users/users.service';
import { RatesController } from '../rates.controller';
import { RatesModule } from '../rates.module';
import { RatesService } from '../rates.service';
import { RatesStatsService } from '../stats/rates-stats.service';
import { RatesHistoryService } from '../history/rates-history.service';
import { HistoricalRatesStatsService } from '../stats/historical-rates-stats.service';
import { Rate } from '../entities/rate.entity';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';

describe('RatesModule characterization', () => {
  let moduleRef: TestingModule;
  const rateRepository = {};
  const rateVoteEventRepository = {};
  const discRepository = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [RatesModule] })
      .overrideProvider(getRepositoryToken(Rate))
      .useValue(rateRepository)
      .overrideProvider(getRepositoryToken(RateVoteEvent))
      .useValue(rateVoteEventRepository)
      .overrideProvider(getRepositoryToken(Disc))
      .useValue(discRepository)
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({ get: () => 'rates-test-secret' })
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  it('resolves the controller, services and repositories through RatesModule', () => {
    expect(moduleRef.get(RatesController)).toBeDefined();
    expect(moduleRef.get(RatesService)).toBeDefined();
    expect(moduleRef.get(RatesStatsService)).toBeDefined();
    expect(moduleRef.get(UsersService)).toBeDefined();
    expect(moduleRef.get(RatesHistoryService)).toBeDefined();
    expect(moduleRef.get(HistoricalRatesStatsService)).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(Rate))).toBe(rateRepository);
    expect(moduleRef.get(getRepositoryToken(RateVoteEvent))).toBe(
      rateVoteEventRepository,
    );
    expect(moduleRef.get(RatesService)).toHaveProperty(
      'rateRepository',
      rateRepository,
    );
    expect(moduleRef.get(RatesStatsService)).toHaveProperty(
      'rateRepository',
      rateRepository,
    );
    expect(moduleRef.get(RatesHistoryService)).toHaveProperty(
      'rateRepository',
      rateRepository,
    );
    expect(moduleRef.get(getRepositoryToken(Disc))).toBe(discRepository);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, RatesModule) as unknown[],
    ).toEqual(expect.arrayContaining([AuthorizationModule, UsersModule]));
  });

  it('preserves Rate relation metadata and inverse sides', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Type<unknown>, property: string) =>
      relations.find(
        (entry) => entry.target === target && entry.propertyName === property,
      );
    const inverseSide = (
      relationEntry: (typeof relations)[number] | undefined,
      entity: object,
    ) => {
      const inverseSideProperty = relationEntry?.inverseSideProperty;
      return typeof inverseSideProperty === 'function'
        ? inverseSideProperty(entity)
        : undefined;
    };
    const rateUser = relation(Rate, 'user');
    expect(rateUser).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, onDelete: 'CASCADE' },
    });
    expect(inverseSide(rateUser, { rate: 'user.rate' })).toBe('user.rate');
    const rateDisc = relation(Rate, 'disc');
    expect(rateDisc).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, onDelete: 'CASCADE' },
    });
    expect(inverseSide(rateDisc, { rates: 'disc.rates' })).toBe('disc.rates');
    const userRate = relation(User, 'rate');
    expect(userRate).toMatchObject({
      relationType: 'one-to-many',
      options: { cascade: true },
    });
    expect(inverseSide(userRate, { user: 'rate.user' })).toBe('rate.user');
    const discRates = relation(Disc, 'rates');
    expect(discRates).toMatchObject({ relationType: 'one-to-many' });
    expect(discRates?.options.eager).toBeUndefined();
    expect(inverseSide(discRates, { disc: 'rate.disc' })).toBe('rate.disc');
  });
});
