import { ContentSchedulerService } from './content-scheduler.service';
import { ContentType } from './entities/content.entity';
import { ContentsModule } from './contents.module';
import { DiscLinkMaintenanceService } from 'src/catalog/discs/maintenance/disc-link-maintenance.service';
import { DiscModule } from 'src/catalog/discs/discs.module';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';

const cronOptions = (target: object, method: string) =>
  Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, (target as any).prototype[method]);

describe('ContentSchedulerService weekly Content/Reunion job', () => {
  it('keeps the Monday schedule and Europe/Madrid timezone', () => {
    expect(cronOptions(ContentSchedulerService, 'createWeeklyContent')).toEqual(
      {
        cronTime: '0 8 * * 1',
        timeZone: 'Europe/Madrid',
      },
    );
  });

  it('still creates weekly Reunion Content with the existing author and date', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'content-id' });
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'author-id' }),
    };
    const scheduler = new ContentSchedulerService(
      userRepo as any,
      { create } as any,
    );
    const monday = new Date(2026, 9, 19, 10);
    const nextWednesday = new Date(monday);
    nextWednesday.setDate(monday.getDate() + 2);
    nextWednesday.setHours(20, 0, 0, 0);
    jest.useFakeTimers().setSystemTime(monday);

    try {
      await scheduler.createWeeklyContent();
    } finally {
      jest.useRealTimers();
    }

    expect(create).toHaveBeenCalledWith({
      name: 'Reunion 21-10-2026',
      type: ContentType.REUNION,
      authorId: 'author-id',
      publicationDate: nextWednesday.toISOString(),
    });
  });

  it('does not create Content outside Monday', async () => {
    const create = jest.fn();
    const scheduler = new ContentSchedulerService(
      { findOne: jest.fn() } as any,
      { create } as any,
    );
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 10));

    try {
      await scheduler.createWeeklyContent();
    } finally {
      jest.useRealTimers();
    }

    expect(create).not.toHaveBeenCalled();
  });
});

describe('Contents/Discs scheduled-job wiring', () => {
  it('registers the daily job once in DiscModule and keeps only the weekly job in ContentsModule', () => {
    const discProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DiscModule,
    ) as unknown[];
    const contentProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];
    const contentImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ContentsModule,
    ) as { module?: unknown }[];

    expect(
      discProviders.filter(
        (provider) => provider === DiscLinkMaintenanceService,
      ),
    ).toHaveLength(1);
    expect(
      contentProviders.filter(
        (provider) => provider === ContentSchedulerService,
      ),
    ).toHaveLength(1);
    expect(contentProviders).not.toContain(DiscLinkMaintenanceService);
    expect(
      contentImports.some(
        (module) => module === DiscModule || module?.module === DiscModule,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, DiscModule),
    ).not.toContain(ContentsModule);
    expect(
      (ContentSchedulerService.prototype as any).checkMissingSpotifyLinks,
    ).toBeUndefined();
    expect(
      cronOptions(DiscLinkMaintenanceService, 'checkMissingSpotifyLinks'),
    ).toEqual({
      cronTime: '0 6 * * *',
      timeZone: 'Europe/Madrid',
    });
  });
});
