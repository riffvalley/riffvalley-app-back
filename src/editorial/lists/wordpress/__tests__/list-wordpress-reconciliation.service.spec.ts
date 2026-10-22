import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  WordpressService,
  WordpressWriteError,
} from 'src/integrations/wordpress-integration/wordpress.service';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api';
import { ListWordPressReconciliationService } from '../list-wordpress-reconciliation.service';
import {
  GutenbergDiscAssignment,
  PublishableGutenbergDiscAssignment,
} from '../list-gutenberg-builder';

type WordpressServiceMock = jest.Mocked<
  Pick<
    WordpressService,
    | 'updatePostContent'
    | 'getPost'
    | 'createPost'
    | 'findPostBySlug'
    | 'findAuthorBySlug'
  >
>;

type SpotifyPublicApiServiceMock = jest.Mocked<
  Pick<SpotifyPublicApiService, 'getAlbumTracks' | 'getArtistSingles'>
>;

describe('ListWordPressReconciliationService', () => {
  const discId = '11111111-1111-4111-8111-111111111111';
  const footer = '<!-- wp:separator {"className":"rv-generated-footer"} -->';
  const block = (id: string, content = id) =>
    `<!-- wp:group {"className":"rv-disc-${id}"} -->\n<div>${content}</div>\n<!-- /wp:group -->`;
  const assignment = (id = discId): PublishableGutenbergDiscAssignment => ({
    spotifyTrackId: null,
    disc: { id, name: 'Album', artist: { name: 'Artist' } },
    user: null,
  });
  const render = (discs: GutenbergDiscAssignment[]) =>
    discs
      .map((disc) =>
        block(disc.disc?.id ?? '', disc.description ?? disc.disc?.name ?? ''),
      )
      .join('\n\n');

  const setup = async () => {
    const post = {
      id: 1,
      link: 'https://example.test/post',
      title: { rendered: 'Post' },
      status: 'draft',
    };
    const wordpressService: WordpressServiceMock = {
      createPost: jest.fn<
        ReturnType<WordpressService['createPost']>,
        Parameters<WordpressService['createPost']>
      >(),
      findPostBySlug: jest.fn<
        ReturnType<WordpressService['findPostBySlug']>,
        Parameters<WordpressService['findPostBySlug']>
      >(),
      updatePostContent: jest
        .fn<
          ReturnType<WordpressService['updatePostContent']>,
          Parameters<WordpressService['updatePostContent']>
        >()
        .mockResolvedValue(post),
      getPost: jest.fn<
        ReturnType<WordpressService['getPost']>,
        Parameters<WordpressService['getPost']>
      >(),
      findAuthorBySlug: jest.fn<
        ReturnType<WordpressService['findAuthorBySlug']>,
        Parameters<WordpressService['findAuthorBySlug']>
      >(),
    };
    const spotifyApiService: SpotifyPublicApiServiceMock = {
      getAlbumTracks: jest
        .fn<
          ReturnType<SpotifyPublicApiService['getAlbumTracks']>,
          Parameters<SpotifyPublicApiService['getAlbumTracks']>
        >()
        .mockResolvedValue([]),
      getArtistSingles: jest
        .fn<
          ReturnType<SpotifyPublicApiService['getArtistSingles']>,
          Parameters<SpotifyPublicApiService['getArtistSingles']>
        >()
        .mockResolvedValue([]),
    };
    const module = await Test.createTestingModule({
      providers: [
        ListWordPressReconciliationService,
        { provide: WordpressService, useValue: wordpressService },
        { provide: SpotifyPublicApiService, useValue: spotifyApiService },
      ],
    }).compile();

    return {
      service: module.get(ListWordPressReconciliationService),
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
    const post = {
      id: 42,
      link: 'https://example.test/post',
      title: { rendered: 'Title' },
      status: 'draft',
    };
    const { service, wordpressService } = await setup();
    wordpressService.createPost.mockResolvedValue(post);

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
    const post = {
      id: 42,
      link: 'https://example.test/post',
      title: { rendered: 'Title' },
      status: 'draft',
    };
    const uncertain = new WordpressWriteError('socket closed', 'unknown');
    const { service, wordpressService } = await setup();
    wordpressService.createPost.mockRejectedValue(uncertain);
    wordpressService.findPostBySlug.mockResolvedValue(post);

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
    const { service, wordpressService } = await setup();
    wordpressService.updatePostContent.mockRejectedValue(
      new WordpressWriteError('socket closed', 'unknown'),
    );
    wordpressService.getPost.mockResolvedValue({
      content: requested,
      status: 'draft',
    });

    await expect(
      service.updatePostContentWithReconciliation(42, requested, [discId]),
    ).resolves.toBeUndefined();
    expect(wordpressService.updatePostContent).toHaveBeenCalledTimes(1);
    expect(wordpressService.getPost).toHaveBeenCalledTimes(1);
  });

  it('returns an uncertain error when reread cannot verify the write', async () => {
    const { service, wordpressService } = await setup();
    wordpressService.updatePostContent.mockRejectedValue(
      new WordpressWriteError('socket closed', 'unknown'),
    );
    wordpressService.getPost.mockResolvedValue({
      content: footer,
      status: 'draft',
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
    const { service, wordpressService } = await setup();

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
    const { service, wordpressService } = await setup();
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
    const { service, wordpressService } = await setup();
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
    const author = {
      id: 7,
      name: 'Reviewer',
      link: 'https://example.test/reviewer',
    };
    const { service, wordpressService, spotifyApiService } = await setup();
    wordpressService.findAuthorBySlug.mockResolvedValue(author);
    spotifyApiService.getAlbumTracks.mockResolvedValue([
      { id: 'one', name: 'One', trackNumber: 1 },
      { id: 'two', name: 'Two', trackNumber: 2 },
      { id: 'third-track', name: 'Three', trackNumber: 3 },
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
