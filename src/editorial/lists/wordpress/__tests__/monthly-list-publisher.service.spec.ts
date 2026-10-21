import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { ListCrudService } from '../../application/list-crud.service';
import { ListCalendarService } from '../../application/list-calendar.service';
import { ListContentCoordinator } from '../../application/list-content-coordinator.service';
import { List, ListType } from '../../entities/list.entity';
import { ListsService } from '../../list.service';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import { ListWordPressReconciliationService } from '../list-wordpress-reconciliation.service';
import { MonthlyListPublisherService } from '../monthly-list-publisher.service';
import { PublishableGutenbergDiscAssignment } from '../list-gutenberg-builder';
import { WeeklyListPublisherService } from '../weekly-list-publisher.service';

type WordpressMock = jest.Mocked<
  Pick<WordpressService, 'getPost' | 'findPostBySlug' | 'getOrCreateTag'>
>;
type ReconciliationMock = jest.Mocked<
  Pick<
    ListWordPressReconciliationService,
    | 'resolveSpotifyTrackId'
    | 'resolveAuthors'
    | 'toPublishedDiscRecord'
    | 'createPostAndReconcile'
    | 'syncDiscsIntoPost'
    | 'getUniqueDiscSection'
    | 'replaceDiscSection'
    | 'insertBeforeFooter'
    | 'updatePostContentWithReconciliation'
    | 'uncertainWordPressResult'
  >
>;

describe('MonthlyListPublisherService', () => {
  class MonthlyPublisherResultFixture {
    readonly published = true;

    get wpPostId(): number {
      return 77;
    }

    get link(): string {
      return 'https://wp.test/published';
    }

    get title(): string {
      return 'Published monthly post';
    }
  }

  const discA = '11111111-1111-4111-8111-111111111111';
  const discB = '22222222-2222-4222-8222-222222222222';
  const footer = '<!-- wp:separator {"className":"rv-generated-footer"} -->';

  const asignation = (
    discId: string,
    position: number | null,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: `asignation-${discId}`,
    position,
    spotifyTrackId: null,
    disc: {
      id: discId,
      name: `Album ${discId}`,
      artist: { name: `Artist ${discId}` },
      image: null,
      debut: false,
      description: null,
    },
    description: null,
    genre: 'Rock',
    user: null,
    ...overrides,
  });

  const makeList = (
    asignations: PublishableGutenbergDiscAssignment[],
    overrides: Record<string, unknown> = {},
  ): List =>
    Object.assign(new List(), {
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations,
      wpPostId: null,
      wpPostUrl: null,
      wpPublishedDiscs: null,
      ...overrides,
    });

  const toPublishedRecord = (a: PublishableGutenbergDiscAssignment) => ({
    discId: a.disc.id,
    artist: a.disc.artist.name,
    name: a.disc.name,
  });

  const setup = async (
    overrides: {
      save?: jest.MockedFunction<(list: DeepPartial<List>) => Promise<List>>;
      wordpress?: Partial<WordpressMock>;
      reconciliation?: Partial<ReconciliationMock>;
    } = {},
  ) => {
    const repository = new Repository(
      List,
      new DataSource({ type: 'postgres' }).manager,
    );
    jest
      .spyOn(repository, 'save')
      .mockImplementation(async (value) =>
        overrides.save
          ? overrides.save(value)
          : Object.assign(new List(), value),
      );
    const wordpressService: WordpressMock = {
      getPost: jest
        .fn<
          ReturnType<WordpressService['getPost']>,
          Parameters<WordpressService['getPost']>
        >()
        .mockResolvedValue({ content: footer, status: 'draft' }),
      findPostBySlug: jest
        .fn<
          ReturnType<WordpressService['findPostBySlug']>,
          Parameters<WordpressService['findPostBySlug']>
        >()
        .mockResolvedValue(null),
      getOrCreateTag: jest
        .fn<
          ReturnType<WordpressService['getOrCreateTag']>,
          Parameters<WordpressService['getOrCreateTag']>
        >()
        .mockImplementation(async (value) => (value === '2026' ? 2026 : 10)),
      ...overrides.wordpress,
    };
    const reconciliationService: ReconciliationMock = {
      resolveSpotifyTrackId: jest
        .fn<
          ReturnType<
            ListWordPressReconciliationService['resolveSpotifyTrackId']
          >,
          Parameters<
            ListWordPressReconciliationService['resolveSpotifyTrackId']
          >
        >()
        .mockImplementation(
          async (asignation) => asignation.spotifyTrackId ?? 'resolved-track',
        ),
      resolveAuthors: jest
        .fn<
          ReturnType<ListWordPressReconciliationService['resolveAuthors']>,
          Parameters<ListWordPressReconciliationService['resolveAuthors']>
        >()
        .mockResolvedValue([null]),
      toPublishedDiscRecord: jest.fn<
        ReturnType<ListWordPressReconciliationService['toPublishedDiscRecord']>,
        Parameters<ListWordPressReconciliationService['toPublishedDiscRecord']>
      >(toPublishedRecord),
      createPostAndReconcile: jest
        .fn<
          ReturnType<
            ListWordPressReconciliationService['createPostAndReconcile']
          >,
          Parameters<
            ListWordPressReconciliationService['createPostAndReconcile']
          >
        >()
        .mockResolvedValue({
          post: {
            id: 42,
            link: 'https://wp.test/monthly',
            title: { rendered: 'Monthly post' },
            status: 'draft',
          },
          reconciled: false,
        }),
      syncDiscsIntoPost: jest
        .fn<
          ReturnType<ListWordPressReconciliationService['syncDiscsIntoPost']>,
          Parameters<ListWordPressReconciliationService['syncDiscsIntoPost']>
        >()
        .mockResolvedValue({
          publishedDiscs: [],
          updatedContent: '',
          contentChanged: false,
          trackingChanged: false,
          newCount: 0,
          existingCount: 0,
          removedDiscs: [],
          notFoundForUpdate: 0,
        }),
      getUniqueDiscSection: jest
        .fn<
          ReturnType<
            ListWordPressReconciliationService['getUniqueDiscSection']
          >,
          Parameters<ListWordPressReconciliationService['getUniqueDiscSection']>
        >()
        .mockReturnValue(null),
      replaceDiscSection: jest
        .fn<
          ReturnType<ListWordPressReconciliationService['replaceDiscSection']>,
          Parameters<ListWordPressReconciliationService['replaceDiscSection']>
        >()
        .mockReturnValue(null),
      insertBeforeFooter: jest
        .fn<
          ReturnType<ListWordPressReconciliationService['insertBeforeFooter']>,
          Parameters<ListWordPressReconciliationService['insertBeforeFooter']>
        >()
        .mockImplementation((_content, block) => `${block}\n\n${footer}`),
      updatePostContentWithReconciliation: jest
        .fn<
          ReturnType<
            ListWordPressReconciliationService['updatePostContentWithReconciliation']
          >,
          Parameters<
            ListWordPressReconciliationService['updatePostContentWithReconciliation']
          >
        >()
        .mockResolvedValue(undefined),
      uncertainWordPressResult: jest
        .fn<
          ReturnType<
            ListWordPressReconciliationService['uncertainWordPressResult']
          >,
          Parameters<
            ListWordPressReconciliationService['uncertainWordPressResult']
          >
        >()
        .mockImplementation(
          (message) => new ServiceUnavailableException(message),
        ),
      ...overrides.reconciliation,
    };
    const module = await Test.createTestingModule({
      providers: [
        MonthlyListPublisherService,
        { provide: getRepositoryToken(List), useValue: repository },
        { provide: WordpressService, useValue: wordpressService },
        {
          provide: ListWordPressReconciliationService,
          useValue: reconciliationService,
        },
      ],
    }).compile();

    return {
      service: module.get(MonthlyListPublisherService),
      repository,
      wordpressService,
      reconciliationService,
      module,
    };
  };

  it('is registered with List repository, WordPress, and reconciliation providers', async () => {
    const module = await Test.createTestingModule({
      providers: [
        MonthlyListPublisherService,
        { provide: getRepositoryToken(List), useValue: { save: jest.fn() } },
        { provide: WordpressService, useValue: {} },
        { provide: ListWordPressReconciliationService, useValue: {} },
      ],
    }).compile();

    expect(module.get(MonthlyListPublisherService)).toBeInstanceOf(
      MonthlyListPublisherService,
    );
    await module.close();
  });

  it('creates a monthly post in editorial order, including position 0 and more than four discs', async () => {
    const discs = [
      asignation(discB, 2),
      asignation(discA, 0, { spotifyTrackId: 'manual-track' }),
      asignation('33333333-3333-4333-8333-333333333333', 1),
      asignation('44444444-4444-4444-8444-444444444444', 3),
      asignation('55555555-5555-4555-8555-555555555555', 4),
    ];
    const month = makeList(discs);
    const { service, repository, wordpressService, reconciliationService } =
      await setup();

    const result = await service.generateBestDiscsWordPressPost(month);

    expect(result).toEqual({
      wpPostId: 42,
      link: 'https://wp.test/monthly',
      title: 'Mejores discos de octubre 2026',
    });
    const [title, content, status, meta, categories, tags, slug] =
      reconciliationService.createPostAndReconcile.mock.calls[0];
    expect(title).toBe('Mejores discos de octubre 2026');
    expect(content.indexOf(discA)).toBeLessThan(content.indexOf('33333333'));
    expect(content.indexOf('33333333')).toBeLessThan(content.indexOf(discB));
    expect(content).toContain(discA);
    expect(content).toContain(discB);
    expect(status).toBe('draft');
    expect(meta).toEqual({
      rank_math_title: 'Mejores discos de octubre de 2026 • Riff Valley',
      rank_math_description:
        'Os dejamos un listado con una selección de los mejores discos del mes de octubre de 2026. ¡No te los pierdas!',
      rank_math_focus_keyword: 'mejores discos,octubre,2026',
    });
    expect(categories).toEqual([72, 597]);
    expect(tags).toEqual([219, 235, 2030, 2031, 2026, 10]);
    expect(slug).toBe('mejores-discos-de-octubre-2026');
    expect(reconciliationService.resolveSpotifyTrackId).toHaveBeenCalledWith(
      discs[1],
    );
    expect(reconciliationService.resolveAuthors).toHaveBeenCalledWith(
      expect.arrayContaining(discs),
    );
    expect(month.wpPublishedDiscs).toHaveLength(5);
    expect(month.wpPublishedDiscs[0]).toEqual(toPublishedRecord(discs[1]));
    expect(repository.save).toHaveBeenCalledWith(month);
    expect(wordpressService.getOrCreateTag).toHaveBeenCalledWith('2026');
    expect(wordpressService.getOrCreateTag).toHaveBeenCalledWith('octubre');
  });

  it('rejects non-MONTH lists and MONTH lists without discs', async () => {
    const { service, reconciliationService } = await setup();
    await expect(
      service.generateBestDiscsWordPressPost(
        makeList([asignation(discA, 0)], { type: ListType.WEEK }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.generateBestDiscsWordPressPost(makeList([])),
    ).rejects.toThrow('List has no assigned discs');
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
  });

  it('syncs an already linked post, including an empty post, through reconciliation', async () => {
    const month = makeList([asignation(discA, 0)], {
      wpPostId: 42,
      wpPostUrl: 'https://wp.test/monthly',
      wpPublishedDiscs: [],
    });
    const { service, wordpressService, reconciliationService } = await setup({
      wordpress: {
        getPost: jest.fn().mockResolvedValue({ content: '', status: 'draft' }),
      },
      reconciliation: {
        syncDiscsIntoPost: jest.fn().mockResolvedValue({
          publishedDiscs: [toPublishedRecord(month.asignations[0])],
          trackingChanged: true,
          newCount: 1,
          existingCount: 0,
          removedDiscs: [],
          notFoundForUpdate: 0,
        }),
      },
    });

    await expect(
      service.generateBestDiscsWordPressPost(month),
    ).resolves.toMatchObject({
      wpPostId: 42,
      added: 1,
      updated: 0,
    });

    expect(wordpressService.getPost).toHaveBeenCalledWith(42);
    expect(reconciliationService.syncDiscsIntoPost).toHaveBeenCalledWith(
      42,
      '',
      month.asignations,
      [],
      expect.any(Function),
      true,
    );
    expect(month.wpPublishedDiscs).toEqual([
      toPublishedRecord(month.asignations[0]),
    ]);
  });

  it('adopts a post found by slug and stores tracking', async () => {
    const month = makeList([asignation(discA, 1)]);
    const { service, reconciliationService, repository } = await setup({
      wordpress: {
        findPostBySlug: jest.fn().mockResolvedValue({
          id: 77,
          link: 'https://wp.test/adopted',
          status: 'draft',
        }),
      },
    });

    await expect(
      service.generateBestDiscsWordPressPost(month),
    ).resolves.toEqual({
      wpPostId: 77,
      link: 'https://wp.test/adopted',
      title: 'Mejores discos de octubre 2026',
      skipped: true,
    });
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(month);
    expect(month.wpPostId).toBe(77);
  });

  it('does not adopt a trashed slug and recreates missing or trashed tracked posts', async () => {
    const { service, reconciliationService } = await setup({
      wordpress: {
        findPostBySlug: jest.fn().mockResolvedValue({
          id: 88,
          link: 'trash',
          status: 'trash',
        }),
      },
    });
    await expect(
      service.generateBestDiscsWordPressPost(makeList([asignation(discA, 1)])),
    ).rejects.toBeInstanceOf(ConflictException);

    for (const missingPost of [null, { content: '', status: 'trash' }]) {
      const month = makeList([asignation(discA, 1)], {
        wpPostId: 9,
        wpPostUrl: 'old',
        wpPublishedDiscs: [toPublishedRecord(asignation(discA, 1))],
      });
      const recreation = await setup({
        wordpress: {
          getPost: jest.fn().mockResolvedValue(missingPost),
        },
      });
      await expect(
        recreation.service.generateBestDiscsWordPressPost(month),
      ).resolves.toMatchObject({ recreated: true, wpPostId: 42 });
      expect(month.wpPostId).toBe(42);
      expect(
        recreation.reconciliationService.createPostAndReconcile,
      ).toHaveBeenCalledTimes(1);
    }
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
  });

  it('saves tracking only after WordPress confirms a new post and adopts it on retry after save failure', async () => {
    const month = makeList([asignation(discA, 0)]);
    const remote = {
      id: 42,
      link: 'https://wp.test/monthly',
      status: 'draft',
    };
    const save = jest
      .fn<Promise<List>, [DeepPartial<List>]>()
      .mockRejectedValueOnce(new Error('tracking save failed'))
      .mockResolvedValue(month);
    const { service, wordpressService, reconciliationService } = await setup({
      save,
      wordpress: {
        findPostBySlug: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(remote),
      },
    });

    await expect(service.generateBestDiscsWordPressPost(month)).rejects.toThrow(
      'tracking save failed',
    );
    const retry = makeList([asignation(discA, 0)]);
    await service.generateBestDiscsWordPressPost(retry);

    expect(reconciliationService.createPostAndReconcile).toHaveBeenCalledTimes(
      1,
    );
    expect(wordpressService.findPostBySlug).toHaveBeenCalledTimes(2);
    expect(retry.wpPostId).toBe(remote.id);
  });

  it('synchronizes a single MONTH assignment with its manual track, author, footer and tracking', async () => {
    const manual = asignation(discA, 0, { spotifyTrackId: 'manual-track' });
    const month = makeList([manual], {
      wpPostId: 42,
      wpPostUrl: 'https://wp.test/monthly',
      wpPublishedDiscs: [],
    });
    const { service, wordpressService, reconciliationService, repository } =
      await setup({
        reconciliation: {
          resolveAuthors: jest
            .fn()
            .mockResolvedValue([
              { name: 'Editor', link: 'https://wp.test/author/editor' },
            ]),
          insertBeforeFooter: jest.fn(
            (_content, block) => `${block}\n${footer}`,
          ),
        },
      });

    await expect(service.syncDiscToMonthlyPost(month, manual)).resolves.toEqual(
      { synced: true },
    );

    expect(wordpressService.getPost).toHaveBeenCalledWith(42);
    expect(reconciliationService.resolveSpotifyTrackId).toHaveBeenCalledWith(
      manual,
    );
    expect(reconciliationService.resolveAuthors).toHaveBeenCalledWith([manual]);
    expect(
      reconciliationService.updatePostContentWithReconciliation,
    ).toHaveBeenCalledWith(42, expect.stringContaining(footer), [discA]);
    expect(month.wpPublishedDiscs).toEqual([toPublishedRecord(manual)]);
    expect(repository.save).toHaveBeenCalledWith(month);
  });

  it('updates an existing disc block without duplicating tracking and skips missing or trashed linked posts', async () => {
    const existingRecord = toPublishedRecord(asignation(discA, 0));
    const month = makeList([asignation(discA, 0)], {
      wpPostId: 42,
      wpPublishedDiscs: [existingRecord],
    });
    const { service, repository, reconciliationService } = await setup({
      reconciliation: {
        getUniqueDiscSection: jest.fn().mockReturnValue({ start: 0, end: 5 }),
        replaceDiscSection: jest.fn().mockReturnValue('updated remote content'),
      },
    });

    await service.syncDiscToMonthlyPost(month, month.asignations[0]);
    expect(reconciliationService.replaceDiscSection).toHaveBeenCalledWith(
      footer,
      discA,
      expect.any(String),
    );
    expect(
      reconciliationService.updatePostContentWithReconciliation,
    ).toHaveBeenCalledWith(42, 'updated remote content', []);
    expect(repository.save).not.toHaveBeenCalled();

    for (const unavailable of [null, { content: footer, status: 'trash' }]) {
      const skipped = await setup({
        wordpress: { getPost: jest.fn().mockResolvedValue(unavailable) },
      });
      await expect(
        skipped.service.syncDiscToMonthlyPost(month, month.asignations[0]),
      ).resolves.toEqual({ synced: false });
      expect(
        skipped.reconciliationService.updatePostContentWithReconciliation,
      ).not.toHaveBeenCalled();
    }
  });

  it('keeps the ListsService public methods and dispatches MONTH while preserving WEEK delegation', async () => {
    const month = makeList([asignation(discA, 0)]);
    const weekly: jest.Mocked<
      Pick<WeeklyListPublisherService, 'syncDiscToWeeklyPost'>
    > = {
      syncDiscToWeeklyPost: jest
        .fn<
          ReturnType<WeeklyListPublisherService['syncDiscToWeeklyPost']>,
          Parameters<WeeklyListPublisherService['syncDiscToWeeklyPost']>
        >()
        .mockResolvedValue({ synced: true }),
    };
    const monthly = {
      generateBestDiscsWordPressPost: jest
        .fn<
          ReturnType<
            MonthlyListPublisherService['generateBestDiscsWordPressPost']
          >,
          Parameters<
            MonthlyListPublisherService['generateBestDiscsWordPressPost']
          >
        >()
        .mockResolvedValue(new MonthlyPublisherResultFixture()),
      syncDiscToMonthlyPost: jest
        .fn<
          ReturnType<MonthlyListPublisherService['syncDiscToMonthlyPost']>,
          Parameters<MonthlyListPublisherService['syncDiscToMonthlyPost']>
        >()
        .mockResolvedValue({ synced: true }),
    };
    const findOne = jest.fn<Promise<List>, [string]>().mockResolvedValue(month);
    const module = await Test.createTestingModule({
      providers: [
        ListsService,
        { provide: ListCrudService, useValue: { findOne } },
        { provide: ListCalendarService, useValue: {} },
        { provide: ListContentCoordinator, useValue: {} },
        { provide: WeeklyListPublisherService, useValue: weekly },
        { provide: MonthlyListPublisherService, useValue: monthly },
      ],
    }).compile();
    const facade = module.get(ListsService);

    await expect(
      facade.generateBestDiscsWordPressPost('list-id'),
    ).resolves.toEqual({
      published: true,
    });
    await expect(
      facade.syncDiscToWordPress('list-id', month.asignations[0].id),
    ).resolves.toEqual({ synced: true });
    expect(monthly.generateBestDiscsWordPressPost).toHaveBeenCalledWith(month);
    expect(monthly.syncDiscToMonthlyPost).toHaveBeenCalledWith(
      month,
      month.asignations[0],
    );

    const radar = makeList([asignation(discB, 1)], { type: ListType.WEEK });
    jest.spyOn(facade, 'findOne').mockResolvedValueOnce(radar);
    await facade.syncDiscToWordPress('list-id', radar.asignations[0].id);
    expect(weekly.syncDiscToWeeklyPost).toHaveBeenCalledWith(
      radar,
      radar.asignations[0],
    );
    await module.close();
  });
});
