import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ListsService } from '../../list.service';
import { ListCalendarService } from '../list-calendar.service';
import { ListCrudService } from '../list-crud.service';
import { ListContentCoordinator } from '../list-content-coordinator.service';
import { ListWordPressReconciliationService } from '../../wordpress/list-wordpress-reconciliation.service';
import { WeeklyListPublisherService } from '../../wordpress/weekly-list-publisher.service';
import { MonthlyListPublisherService } from '../../wordpress/monthly-list-publisher.service';
import { List, ListType } from '../../entities/list.entity';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api';
import { ListsModule } from '../../list.module';
import { NewsService } from 'src/product/news/news.service';

describe('ListCalendarService Nest wiring', () => {
  it('is registered by ListsModule and injected into the ListsService facade', async () => {
    const list = { id: 'list-id' } as List;
    const listRepository = {
      find: jest.fn().mockResolvedValue([list]),
    };
    const module = await Test.createTestingModule({
      providers: [
        ListsService,
        ListCalendarService,
        ListCrudService,
        { provide: ListContentCoordinator, useValue: {} },
        ListWordPressReconciliationService,
        WeeklyListPublisherService,
        MonthlyListPublisherService,
        { provide: getRepositoryToken(List), useValue: listRepository },
        { provide: getRepositoryToken(Content), useValue: {} },
        { provide: WordpressService, useValue: {} },
        { provide: SpotifyPublicApiService, useValue: {} },
        {
          provide: NewsService,
          useValue: { invalidateWordPressAndNewsFeedCaches: jest.fn() },
        },
      ],
    }).compile();

    const listsService = module.get(ListsService);
    expect(listsService['listCrudService']).toBe(module.get(ListCrudService));
    expect(listsService['listContentCoordinator']).toBe(
      module.get(ListContentCoordinator),
    );
    expect(await listsService.findAllSpecialLists()).toEqual([list]);
    expect(listRepository.find).toHaveBeenCalledWith({
      where: { type: ListType.SPECIAL },
      order: { name: 'ASC' },
    });
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ListsModule),
    ).toContain(ListCalendarService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ListsModule),
    ).toContain(ListCrudService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ListsModule),
    ).toContain(ListContentCoordinator);

    const error = new Error('calendar query failed');
    listRepository.find.mockRejectedValueOnce(error);
    await expect(listsService.findAllSpecialLists()).rejects.toBe(error);

    await module.close();
  });
});
