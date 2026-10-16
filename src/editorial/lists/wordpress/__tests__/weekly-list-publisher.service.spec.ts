import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { List, ListType } from '../../entities/list.entity';
import { ListsService } from '../../list.service';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import { ListWordPressReconciliationService } from '../list-wordpress-reconciliation.service';
import { WeeklyListPublisherService } from '../weekly-list-publisher.service';

describe('WeeklyListPublisherService', () => {
  const discA = '11111111-1111-4111-8111-111111111111';
  const discB = '22222222-2222-4222-8222-222222222222';
  const inboxDisc = '33333333-3333-4333-8333-333333333333';
  const footer = '<!-- wp:separator {"className":"rv-generated-footer"} -->';

  const asignation = (discId: string, position: number, id = discId) => ({
    id: `asignation-${id}`,
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
    similarBands: 'Other band',
    user: null,
  });

  const list = (asignations: any[], overrides: Record<string, unknown> = {}) =>
    ({
      id: 'list-id',
      type: ListType.WEEK,
      releaseDate: new Date('2026-10-09T00:00:00.000Z'),
      listDate: new Date('2026-10-09T00:00:00.000Z'),
      asignations,
      wpWeeklyPosts: [],
      ...overrides,
    }) as any;

  const publishedRecord = (a: any) => ({
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
      getOrCreateTag: jest
        .fn()
        .mockImplementation(async (value) => (value === '2026' ? 2026 : 10)),
      getPost: jest
        .fn()
        .mockResolvedValue({ content: footer, status: 'draft' }),
      findPostBySlug: jest.fn().mockResolvedValue(null),
      ...overrides.wordpress,
    };
    const reconciliationService = {
      resolveSpotifyTrackId: jest.fn().mockResolvedValue(null),
      toPublishedDiscRecord: jest.fn(publishedRecord),
      createPostAndReconcile: jest.fn().mockResolvedValue({
        post: { id: 100, link: 'https://wp.test/post' },
        reconciled: false,
      }),
      syncDiscsIntoPost: jest
        .fn()
        .mockImplementation(async (_postId, _content, discs) => ({
          publishedDiscs: discs.map(publishedRecord),
          newCount: discs.length,
          existingCount: 0,
          removedDiscs: [],
          notFoundForUpdate: 0,
        })),
      uncertainWordPressResult: jest.fn(
        (detail) => new ServiceUnavailableException(detail),
      ),
      getUniqueDiscSection: jest.fn().mockReturnValue(null),
      insertBeforeFooter: jest.fn(
        (_content, addition) => `${addition}\n\n${footer}`,
      ),
      replaceDiscSection: jest.fn(),
      updatePostContentWithReconciliation: jest
        .fn()
        .mockResolvedValue(undefined),
      ...overrides.reconciliation,
    };
    return {
      service: new WeeklyListPublisherService(
        repository as any,
        wordpressService as unknown as WordpressService,
        reconciliationService as unknown as ListWordPressReconciliationService,
      ),
      repository,
      wordpressService,
      reconciliationService,
    };
  };

  it('is registered with its repository, WordPress, and reconciliation dependencies', async () => {
    const module = await Test.createTestingModule({
      providers: [
        WeeklyListPublisherService,
        { provide: getRepositoryToken(List), useValue: { save: jest.fn() } },
        { provide: WordpressService, useValue: {} },
        { provide: ListWordPressReconciliationService, useValue: {} },
      ],
    }).compile();

    expect(module.get(WeeklyListPublisherService)).toBeInstanceOf(
      WeeklyListPublisherService,
    );
    await module.close();
  });

  it('publishes only positive positions in numeric order and keeps inbox data untouched', async () => {
    const inboxTracking = {
      position: 0,
      wpPostId: 303,
      wpPostUrl: 'https://wp.test/inbox',
      publishedDiscs: [publishedRecord(asignation(inboxDisc, 0))],
    };
    const radar = list(
      [asignation(discB, 2), asignation(inboxDisc, 0), asignation(discA, 1)],
      { wpWeeklyPosts: [inboxTracking] },
    );
    const { service, repository, wordpressService, reconciliationService } =
      setup({
        reconciliation: {
          createPostAndReconcile: jest
            .fn()
            .mockResolvedValueOnce({
              post: { id: 101, link: 'https://wp.test/one' },
              reconciled: false,
            })
            .mockResolvedValueOnce({
              post: { id: 202, link: 'https://wp.test/two' },
              reconciled: false,
            }),
        },
      });

    const result = await service.generateWordPressPosts(radar);

    expect(result.posts.map((post) => post.position)).toEqual([1, 2]);
    expect(reconciliationService.createPostAndReconcile).toHaveBeenCalledTimes(
      2,
    );
    expect(radar.asignations).toHaveLength(3);
    expect(radar.wpWeeklyPosts).toContain(inboxTracking);
    expect(repository.save).toHaveBeenCalledWith(radar);
    expect(wordpressService.getPost).not.toHaveBeenCalledWith(303);
  });

  it('does not publish a list containing only the position 0 inbox', async () => {
    const radar = list([asignation(inboxDisc, 0)]);
    const { service, reconciliationService, repository } = setup();

    await expect(service.generateWordPressPosts(radar)).resolves.toEqual({
      created: 0,
      posts: [],
    });
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(radar);
  });

  it('rejects an explicit request to publish position 0', async () => {
    const { service, reconciliationService } = setup();

    await expect(
      service.generateWordPressPosts(list([asignation(inboxDisc, 0)]), 0),
    ).rejects.toThrow('no tiene discos asignados a la posición 0');
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
  });

  it('rejects non-WEEK lists at the Radar publisher boundary', async () => {
    const { service, reconciliationService } = setup();

    await expect(
      service.generateWordPressPosts(
        list([asignation(discA, 1)], { type: ListType.MONTH }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
  });

  it('preserves group editorial order, titles, slugs, SEO and tags', async () => {
    const radar = list([
      asignation(discB, 1),
      asignation(discA, 1),
      asignation(inboxDisc, 0),
    ]);
    const { service, reconciliationService, wordpressService } = setup();

    await service.generateWordPressPosts(radar, 1);

    const [title, content, status, meta, categories, tags, slug] =
      reconciliationService.createPostAndReconcile.mock.calls[0];
    expect(title).toBe('Nuevos discos - 09/10/2026 (I)');
    expect(content.indexOf(discB)).toBeLessThan(content.indexOf(discA));
    expect(content).not.toContain(inboxDisc);
    expect(status).toBe('draft');
    expect(meta).toEqual({
      rank_math_title: 'Nuevos discos 09 de octubre de 2026 (I) • Riff Valley',
      rank_math_description:
        'Nuevos discos de octubre de 2026: os recopilamos los lanzamientos de la semana del 09/10/2026 que no te puedes perder.',
      rank_math_focus_keyword: 'nuevos discos,octubre,2026,i',
    });
    expect(categories).toEqual([2049, 184]);
    expect(tags).toEqual([189, 2088, 188, 2026, 10]);
    expect(slug).toBe('nuevos-discos091026i');
    expect(wordpressService.getOrCreateTag).toHaveBeenCalledWith('2026');
    expect(wordpressService.getOrCreateTag).toHaveBeenCalledWith('octubre');
  });

  it('retries a tracked position by syncing its existing post without creating a duplicate', async () => {
    const radar = list([asignation(discA, 1)], {
      wpWeeklyPosts: [
        {
          position: 1,
          wpPostId: 101,
          wpPostUrl: 'https://wp.test/one',
          publishedDiscs: [publishedRecord(asignation(discA, 1))],
        },
      ],
    });
    const { service, wordpressService, reconciliationService } = setup();

    const result = await service.generateWordPressPosts(radar);

    expect(result.posts[0]).toMatchObject({ position: 1, wpPostId: 101 });
    expect(wordpressService.getPost).toHaveBeenCalledWith(101);
    expect(reconciliationService.syncDiscsIntoPost).toHaveBeenCalledTimes(1);
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
  });

  it('adopts an existing post by slug and updates its tracking', async () => {
    const radar = list([asignation(discA, 1)]);
    const existing = {
      id: 77,
      link: 'https://wp.test/adopted',
      status: 'draft',
    };
    const { service, wordpressService, reconciliationService, repository } =
      setup({
        wordpress: {
          findPostBySlug: jest.fn().mockResolvedValue(existing),
        },
      });

    const result = await service.generateWordPressPosts(radar);

    expect(result.posts[0]).toMatchObject({
      position: 1,
      wpPostId: 77,
      adopted: true,
    });
    expect(wordpressService.findPostBySlug).toHaveBeenCalledWith(
      'nuevos-discos091026i',
    );
    expect(reconciliationService.createPostAndReconcile).not.toHaveBeenCalled();
    expect(radar.wpWeeklyPosts[0].publishedDiscs).toEqual([
      publishedRecord(asignation(discA, 1)),
    ]);
    expect(repository.save).toHaveBeenCalledWith(radar);
  });

  it.each([null, { content: footer, status: 'trash' }])(
    'recreates a linked post that is missing or trashed (%p)',
    async (linkedPost) => {
      const radar = list([asignation(discA, 1)], {
        wpWeeklyPosts: [
          {
            position: 1,
            wpPostId: 55,
            wpPostUrl: 'https://wp.test/old',
            publishedDiscs: [],
          },
        ],
      });
      const { service, wordpressService, reconciliationService } = setup({
        wordpress: {
          getPost: jest.fn().mockResolvedValue(linkedPost),
        },
      });

      await service.generateWordPressPosts(radar);

      expect(wordpressService.getPost).toHaveBeenCalledWith(55);
      expect(
        reconciliationService.createPostAndReconcile,
      ).toHaveBeenCalledTimes(1);
      expect(radar.wpWeeklyPosts).toHaveLength(1);
      expect(radar.wpWeeklyPosts[0].wpPostId).toBe(100);
    },
  );

  it('propagates an uncertain remote result without saving tracking', async () => {
    const radar = list([asignation(discA, 1)]);
    const uncertain = new ServiceUnavailableException('unknown');
    const { service, repository } = setup({
      reconciliation: {
        createPostAndReconcile: jest.fn().mockRejectedValue(uncertain),
      },
    });

    await expect(service.generateWordPressPosts(radar)).rejects.toBe(uncertain);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not repeat a confirmed remote create when tracking save failed and retry adopts by slug', async () => {
    const firstRadar = list([asignation(discA, 1)]);
    const adopted = {
      id: 100,
      link: 'https://wp.test/post',
      status: 'draft',
    };
    const repositorySave = jest
      .fn()
      .mockRejectedValueOnce(new Error('tracking save failed'))
      .mockResolvedValueOnce(firstRadar);
    const { service, wordpressService, reconciliationService } = setup({
      save: repositorySave,
      wordpress: {
        findPostBySlug: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(adopted),
      },
    });

    await expect(service.generateWordPressPosts(firstRadar)).rejects.toThrow(
      'tracking save failed',
    );
    const retryRadar = list([asignation(discA, 1)]);
    await service.generateWordPressPosts(retryRadar);

    expect(reconciliationService.createPostAndReconcile).toHaveBeenCalledTimes(
      1,
    );
    expect(wordpressService.findPostBySlug).toHaveBeenCalledTimes(2);
    expect(retryRadar.wpWeeklyPosts[0].wpPostId).toBe(adopted.id);
  });

  it('does not sync position 0 and syncs a moved assignment only into its new tracked group', async () => {
    const inbox = asignation(inboxDisc, 0, 'inbox');
    const { service, wordpressService, reconciliationService } = setup();
    await expect(
      service.syncDiscToWeeklyPost(list([inbox]), inbox),
    ).resolves.toEqual({ synced: false });
    expect(wordpressService.getPost).not.toHaveBeenCalled();

    const moved = asignation(discA, 2, 'moved');
    const radar = list([moved], {
      wpWeeklyPosts: [
        { position: 1, wpPostId: 101, wpPostUrl: 'old', publishedDiscs: [] },
        { position: 2, wpPostId: 202, wpPostUrl: 'new', publishedDiscs: [] },
      ],
    });
    await expect(service.syncDiscToWeeklyPost(radar, moved)).resolves.toEqual({
      synced: true,
    });

    expect(wordpressService.getPost).toHaveBeenCalledWith(202);
    expect(
      reconciliationService.updatePostContentWithReconciliation,
    ).toHaveBeenCalledWith(202, expect.any(String), [discA]);
    expect(radar.wpWeeklyPosts[0].publishedDiscs).toEqual([]);
    expect(radar.wpWeeklyPosts[1].publishedDiscs).toEqual([
      publishedRecord(moved),
    ]);
  });

  it('keeps the ListsService method public and delegates after loading the list', async () => {
    const radar = list([asignation(discA, 1)]);
    const { service: publisher } = setup();
    const facade = new ListsService(
      { findOne: jest.fn().mockResolvedValue(radar) } as any,
      {} as any,
      {} as any,
      publisher as any,
      {} as any,
    );
    const publish = jest
      .spyOn(publisher, 'generateWordPressPosts')
      .mockResolvedValue({ created: 0, posts: [] });

    await expect(facade.generateWordPressPosts('list-id', 2)).resolves.toEqual({
      created: 0,
      posts: [],
    });
    expect(publish).toHaveBeenCalledWith(radar, 2);
  });
});
