import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  WordpressService,
  WordpressWriteError,
} from 'src/integrations/wordpress-integration/wordpress.service';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration';
import { ListWordPressReconciliationService } from '../list-wordpress-reconciliation.service';

describe('ListWordPressReconciliationService', () => {
  const discId = '11111111-1111-4111-8111-111111111111';
  const footer = '<!-- wp:separator {"className":"rv-generated-footer"} -->';
  const block = (id: string, content = id) =>
    `<!-- wp:group {"className":"rv-disc-${id}"} -->\n<div>${content}</div>\n<!-- /wp:group -->`;
  const assignment = (id = discId) => ({
    spotifyTrackId: null,
    disc: { id, name: 'Album', artist: { name: 'Artist' } },
    user: null,
  });
  const render = (discs: any[]) =>
    discs
      .map((disc) => block(disc.disc.id, disc.description ?? disc.disc.name))
      .join('\n\n');

  const setup = (overrides: Record<string, jest.Mock> = {}) => {
    const wordpressService = {
      createPost: jest.fn(),
      findPostBySlug: jest.fn(),
      updatePostContent: jest.fn().mockResolvedValue({}),
      getPost: jest.fn(),
      findAuthorBySlug: jest.fn(),
      ...overrides,
    };
    const spotifyApiService = {
      getAlbumTracks: jest.fn().mockResolvedValue([]),
      getArtistSingles: jest.fn().mockResolvedValue([]),
    };
    return {
      service: new ListWordPressReconciliationService(
        wordpressService as unknown as WordpressService,
        spotifyApiService as unknown as SpotifyPublicApiService,
      ),
      wordpressService,
      spotifyApiService,
    };
  };

  it('is constructed by Nest with only WordPress and Spotify providers', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ListWordPressReconciliationService,
        { provide: WordpressService, useValue: {} },
        { provide: SpotifyPublicApiService, useValue: {} },
      ],
    }).compile();

    expect(module.get(ListWordPressReconciliationService)).toBeInstanceOf(
      ListWordPressReconciliationService,
    );
    await module.close();
  });

  it('creates once and returns the confirmed post without a lookup', async () => {
    const post = { id: 42, link: 'https://example.test/post', status: 'draft' };
    const { service, wordpressService } = setup({
      createPost: jest.fn().mockResolvedValue(post),
    });

    await expect(
      service.createPostAndReconcile(
        'Title',
        'HTML',
        'draft',
        {},
        [],
        [],
        'slug',
      ),
    ).resolves.toEqual({ post, reconciled: false });
    expect(wordpressService.createPost).toHaveBeenCalledTimes(1);
    expect(wordpressService.findPostBySlug).not.toHaveBeenCalled();
  });

  it('adopts a post by slug after an uncertain create, and rejects confirmed failures', async () => {
    const post = { id: 42, link: 'https://example.test/post', status: 'draft' };
    const uncertain = new WordpressWriteError('socket closed', 'unknown');
    const { service, wordpressService } = setup({
      createPost: jest.fn().mockRejectedValue(uncertain),
      findPostBySlug: jest.fn().mockResolvedValue(post),
    });

    await expect(
      service.createPostAndReconcile(
        'Title',
        'HTML',
        'draft',
        {},
        [],
        [],
        'slug',
      ),
    ).resolves.toEqual({ post, reconciled: true });
    expect(wordpressService.findPostBySlug).toHaveBeenCalledWith('slug');

    const rejected = new WordpressWriteError('unauthorized', 'rejected', 401);
    wordpressService.createPost.mockRejectedValueOnce(rejected);
    await expect(
      service.createPostAndReconcile(
        'Title',
        'HTML',
        'draft',
        {},
        [],
        [],
        'slug',
      ),
    ).rejects.toBe(rejected);
  });

  it('does not reissue an uncertain content write and confirms it by exact reread', async () => {
    const requested = `${block(discId)}\n\n${footer}`;
    const { service, wordpressService } = setup({
      updatePostContent: jest
        .fn()
        .mockRejectedValue(new WordpressWriteError('socket closed', 'unknown')),
      getPost: jest
        .fn()
        .mockResolvedValue({ content: requested, status: 'draft' }),
    });

    await expect(
      service.updatePostContentWithReconciliation(42, requested, [discId]),
    ).resolves.toBeUndefined();
    expect(wordpressService.updatePostContent).toHaveBeenCalledTimes(1);
    expect(wordpressService.getPost).toHaveBeenCalledTimes(1);
  });

  it('returns an uncertain error when reread cannot verify the write', async () => {
    const { service, wordpressService } = setup({
      updatePostContent: jest
        .fn()
        .mockRejectedValue(new WordpressWriteError('socket closed', 'unknown')),
      getPost: jest
        .fn()
        .mockResolvedValue({ content: footer, status: 'draft' }),
    });

    await expect(
      service.updatePostContentWithReconciliation(42, block(discId), [discId]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(wordpressService.updatePostContent).toHaveBeenCalledTimes(1);
  });

  it('inserts new blocks in input order before the owned footer and preserves foreign content', async () => {
    const secondId = '22222222-2222-4222-8222-222222222222';
    const foreign = block('33333333-3333-4333-8333-333333333333');
    const initial = `intro\n\n${foreign}\n\n${footer}`;
    const { service, wordpressService } = setup();

    const result = await service.syncDiscsIntoPost(
      42,
      initial,
      [assignment(), assignment(secondId)],
      [],
      render,
      false,
    );

    const written = wordpressService.updatePostContent.mock.calls[0][1];
    expect(written.indexOf(discId)).toBeLessThan(written.indexOf(secondId));
    expect(written.indexOf(secondId)).toBeLessThan(written.indexOf(footer));
    expect(written).toContain(foreign);
    expect(result.publishedDiscs.map((disc) => disc.discId)).toEqual([
      discId,
      secondId,
    ]);
  });

  it('is idempotent after success and updates an existing owned block in place', async () => {
    const initial = `intro\n\n${block(discId, 'old')}\n\n${footer}`;
    const { service, wordpressService } = setup();
    const result = await service.syncDiscsIntoPost(
      42,
      initial,
      [{ ...assignment(), description: 'new' }],
      [{ discId, artist: 'Artist', name: 'Album' }],
      render,
      false,
    );

    expect(wordpressService.updatePostContent).toHaveBeenCalledTimes(1);
    expect(wordpressService.updatePostContent.mock.calls[0][1]).toContain(
      'new',
    );
    expect(result.newCount).toBe(0);
    expect(result.existingCount).toBe(1);

    const updatedContent = wordpressService.updatePostContent.mock.calls[0][1];
    wordpressService.updatePostContent.mockClear();
    await service.syncDiscsIntoPost(
      42,
      updatedContent,
      [{ ...assignment(), description: 'new' }],
      result.publishedDiscs,
      render,
      false,
    );
    expect(wordpressService.updatePostContent).not.toHaveBeenCalled();
  });

  it('rejects duplicated, incomplete, or missing markers for tracked blocks before writing', async () => {
    const { service, wordpressService } = setup();
    const duplicate = `${block(discId)}\n\n${block(discId)}`;
    await expect(
      service.syncDiscsIntoPost(
        42,
        duplicate,
        [assignment()],
        [],
        render,
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const incomplete = `<!-- wp:group {"className":"rv-disc-${discId}"} -->`;
    await expect(
      service.syncDiscsIntoPost(
        42,
        incomplete,
        [assignment()],
        [],
        render,
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.syncDiscsIntoPost(
        42,
        footer,
        [assignment()],
        [{ discId, artist: 'Artist', name: 'Album' }],
        render,
        false,
      ),
    ).resolves.toMatchObject({ notFoundForUpdate: 1 });
    expect(wordpressService.updatePostContent).not.toHaveBeenCalled();
  });

  it('resolves Spotify fallback and reviewer authors', async () => {
    const author = { name: 'Reviewer', link: 'https://example.test/reviewer' };
    const { service, wordpressService, spotifyApiService } = setup({
      findAuthorBySlug: jest.fn().mockResolvedValue(author),
    });
    spotifyApiService.getAlbumTracks.mockResolvedValue([
      { id: 'one', name: 'One' },
      { id: 'two', name: 'Two' },
      { id: 'third-track', name: 'Three' },
    ]);

    await expect(service.resolveSpotifyTrackId(assignment())).resolves.toBe(
      'third-track',
    );
    await expect(
      service.resolveAuthors([
        { user: { username: 'reviewer_name' } },
        { user: { username: 'reviewer_name' } },
      ]),
    ).resolves.toEqual([author, author]);
    // The existing resolver performs each lookup concurrently; preserve that behavior.
    expect(wordpressService.findAuthorBySlug).toHaveBeenCalledTimes(2);
    expect(wordpressService.findAuthorBySlug).toHaveBeenCalledWith(
      'reviewer-name',
    );
  });
});
