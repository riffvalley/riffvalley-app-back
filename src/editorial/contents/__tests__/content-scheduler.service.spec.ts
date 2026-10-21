import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { ContentsService } from '../contents.service';
import { ContentSchedulerService } from '../content-scheduler.service';
import { Content, ContentType } from '../entities/content.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { DiscLinkMaintenanceService } from 'src/catalog/discs/maintenance/disc-link-maintenance.service';
import { DiscModule } from 'src/catalog/discs/discs.module';
import { ContentsModule } from '../contents.module';

const cronOptions = (target: { prototype: object }, method: string) => {
  const implementation = Object.getOwnPropertyDescriptor(
    target.prototype,
    method,
  )?.value;
  return typeof implementation === 'function'
    ? Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, implementation)
    : undefined;
};

describe('ContentSchedulerService weekly Content/Reunion job', () => {
  const makeFixture = async () => {
    const dataSource = new DataSource({ type: 'postgres' });
    const userRepository = dataSource.getRepository(User);
    const findOne = jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue(Object.assign(new User(), { id: 'author-id' }));
    const content = Object.assign(new Content(), { id: 'content-id' });
    const contentsService: jest.Mocked<Pick<ContentsService, 'create'>> = {
      create: jest
        .fn<
          ReturnType<ContentsService['create']>,
          Parameters<ContentsService['create']>
        >()
        .mockResolvedValue(content),
    };
    const module = await Test.createTestingModule({
      providers: [
        ContentSchedulerService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: ContentsService, useValue: contentsService },
      ],
    }).compile();

    return {
      scheduler: module.get(ContentSchedulerService),
      module,
      findOne,
      contentsService,
    };
  };

  it('keeps the Monday schedule and Europe/Madrid timezone', () => {
    expect(cronOptions(ContentSchedulerService, 'createWeeklyContent')).toEqual(
      {
        cronTime: '0 8 * * 1',
        timeZone: 'Europe/Madrid',
      },
    );
  });

  it('still creates weekly Reunion Content with the existing author and date', async () => {
    const fixture = await makeFixture();
    const monday = new Date(2026, 9, 19, 10);
    const nextWednesday = new Date(monday);
    nextWednesday.setDate(monday.getDate() + 2);
    nextWednesday.setHours(20, 0, 0, 0);
    jest.useFakeTimers().setSystemTime(monday);

    try {
      await fixture.scheduler.createWeeklyContent();
    } finally {
      jest.useRealTimers();
    }

    expect(fixture.contentsService.create).toHaveBeenCalledWith({
      name: 'Reunion 21-10-2026',
      type: ContentType.REUNION,
      authorId: 'author-id',
      publicationDate: nextWednesday.toISOString(),
    });
    await fixture.module.close();
  });

  it('does not create Content outside Monday', async () => {
    const fixture = await makeFixture();
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 10));

    try {
      await fixture.scheduler.createWeeklyContent();
    } finally {
      jest.useRealTimers();
    }

    expect(fixture.contentsService.create).not.toHaveBeenCalled();
    expect(fixture.findOne).not.toHaveBeenCalled();
    await fixture.module.close();
  });
});

describe('Contents/Discs scheduled-job wiring', () => {
  it('registers the daily job once in DiscModule and keeps only the weekly job in ContentsModule', () => {
    const discProviders: unknown = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DiscModule,
    );
    const contentProviders: unknown = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    );
    const contentImports: unknown = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ContentsModule,
    );
    const discProviderList = Array.isArray(discProviders) ? discProviders : [];
    const contentProviderList = Array.isArray(contentProviders)
      ? contentProviders
      : [];
    const contentImportList = Array.isArray(contentImports)
      ? contentImports
      : [];

    expect(
      discProviderList.filter(
        (provider: unknown) => provider === DiscLinkMaintenanceService,
      ),
    ).toHaveLength(1);
    expect(
      contentProviderList.filter(
        (provider: unknown) => provider === ContentSchedulerService,
      ),
    ).toHaveLength(1);
    expect(contentProviderList).not.toContain(DiscLinkMaintenanceService);
    expect(
      contentImportList.some(
        (module: unknown) =>
          module === DiscModule ||
          (typeof module === 'object' &&
            module !== null &&
            'module' in module &&
            module.module === DiscModule),
      ),
    ).toBe(true);
    const discImports: unknown = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DiscModule,
    );
    expect(Array.isArray(discImports) ? discImports : []).not.toContain(
      ContentsModule,
    );
    expect(
      Object.getOwnPropertyDescriptor(
        ContentSchedulerService.prototype,
        'checkMissingSpotifyLinks',
      ),
    ).toBeUndefined();
    expect(
      cronOptions(DiscLinkMaintenanceService, 'checkMissingSpotifyLinks'),
    ).toEqual({
      cronTime: '0 6 * * *',
      timeZone: 'Europe/Madrid',
    });
  });
});
