import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { List, ListType } from '../../entities/list.entity';
import { ListsService } from '../../list.service';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import { ListWordPressReconciliationService } from '../list-wordpress-reconciliation.service';
import { MonthlyListPublisherService } from '../monthly-list-publisher.service';
import { WeeklyListPublisherService } from '../weekly-list-publisher.service';

describe('MonthlyListPublisherService', () => {
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
    asignations: any[],
    overrides: Record<string, unknown> = {},
  ) =>
    ({
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations,
      wpPostId: null,
      wpPostUrl: null,
      wpPublishedDiscs: null,
      ...overrides,
    }) as any;

  const toPublishedRecord = (a: any) => ({
    discId: a.disc.id,
    artist: a.disc.artist.name,
    name: a.disc.name,
  });

  const setup = (
    overrides: {
      save?: jest.Mock;
      wordpress?: Record<string, jest.Mock>;
      reconciliation?: Record<string, jest.Mock>;
    } = {},
  ) => {
    const repository = {
      save:
        overrides.save ?? jest.fn().mockImplementation(async (value) => value),
    };
    const wordpressService = {
      getPost: jest
        .fn()
        .mockResolvedValue({ content: footer, status: 'draft' }),
      findPostBySlug: jest.fn().mockResolvedValue(null),
      getOrCreateTag: jest
        .fn()
        .mockImplementation(async (value) => (value === '2026' ? 2026 : 10)),
      ...overrides.wordpress,
    };
    const reconciliationService = {
      resolveSpotifyTrackId: jest
        .fn()
        .mockImplementation(async (a) => a.spotifyTrackId ?? 'resolved-track'),
      resolveAuthors: jest.fn().mockResolvedValue([null]),
      toPublishedDiscRecord: jest.fn(toPublishedRecord),
      createPostAndReconcile: jest.fn().mockResolvedValue({
        post: { id: 42, link: 'https://wp.test/monthly' },
        reconciled: false,
      }),
      syncDiscsIntoPost: jest.fn().mockResolvedValue({
        publishedDiscs: [],
        trackingChanged: false,
        newCount: 0,
        existingCount: 0,
        removedDiscs: [],
        notFoundForUpdate: 0,
      }),
      getUniqueDiscSection: jest.fn().mockReturnValue(null),
      replaceDiscSection: jest.fn(),
      insertBeforeFooter: jest.fn((_content, block) => `${block}\n\n${footer}`),
      updatePostContentWithReconciliation: jest
        .fn()
        .mockResolvedValue(undefined),
      uncertainWordPressResult: jest.fn((message) => new Error(message)),
      ...overrides.reconciliation,
    };

    return {
      service: new MonthlyListPublisherService(
        repository as any,
        wordpressService as unknown as WordpressService,
        reconciliationService as unknown as ListWordPressReconciliationService,
      ),
      repository,
      wordpressService,
      reconciliationService,
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
      setup();

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
    const { service, reconciliationService } = setup();
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
    const { service, wordpressService, reconciliationService } = setup({
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
    const { service, wordpressService, reconciliationService, repository } =
      setup({
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
    const { service, reconciliationService } = setup({
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
      const recreation = setup({
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
      .fn()
      .mockRejectedValueOnce(new Error('tracking save failed'))
      .mockResolvedValue(month);
    const { service, wordpressService, reconciliationService } = setup({
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
      setup({
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
    const { service, repository, reconciliationService } = setup({
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
      const skipped = setup({
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
    const weekly = { syncDiscToWeeklyPost: jest.fn() };
    const monthly = {
      generateBestDiscsWordPressPost: jest
        .fn()
        .mockResolvedValue({ published: true }),
      syncDiscToMonthlyPost: jest.fn().mockResolvedValue({ synced: true }),
    };
    const facade = new ListsService(
      {} as any,
      {} as any,
      {} as any,
      weekly as any,
      monthly as any,
    );
    jest.spyOn(facade, 'findOne').mockResolvedValue(month);

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
  });
});
