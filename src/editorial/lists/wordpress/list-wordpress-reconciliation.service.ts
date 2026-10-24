import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  WordpressService,
  WordpressWriteError,
} from 'src/integrations/wordpress-integration/wordpress.service';
import { WpPost } from 'src/integrations/wordpress-integration/types/wordpress.types';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api';
import { NewsService } from 'src/product/news/news.service';
import { PublishedDiscRecord } from '../entities/list.entity';
import {
  FOOTER_MARKER_CLASS,
  GutenbergDiscAssignment,
  PublishableGutenbergDiscAssignment,
} from './list-gutenberg-builder';

type DiscSectionBoundary = { discId: string; start: number; end: number };
type DiscBlockBuilder = (
  discs: GutenbergDiscAssignment[],
  spotifyTrackIds: (string | null)[],
  authors: ({ name: string; link: string } | null)[],
) => string;

@Injectable()
export class ListWordPressReconciliationService {
  private readonly logger = new Logger('ListsService');

  constructor(
    private readonly wordpressService: WordpressService,
    private readonly spotifyApiService: SpotifyPublicApiService,
    private readonly newsService: NewsService,
  ) {}

  async updatePostContentWithReconciliation(
    postId: number,
    content: string,
    insertedDiscIds: string[],
    publicPost = true,
  ) {
    try {
      await this.wordpressService.updatePostContent(postId, content);
      if (publicPost) this.newsService.invalidateWordPressAndNewsFeedCaches();
      return;
    } catch (error) {
      if (
        !(error instanceof WordpressWriteError) ||
        error.outcome !== 'unknown'
      ) {
        throw error;
      }

      let remotePost: { content: string; status: string } | null;
      try {
        remotePost = await this.wordpressService.getPost(postId);
      } catch {
        throw this.uncertainWordPressResult(
          `post #${postId} could not be reread`,
        );
      }

      if (!remotePost || remotePost.status === 'trash') {
        throw this.uncertainWordPressResult(
          `post #${postId} could not be verified after the write`,
        );
      }

      const insertedBlocksConfirmed = insertedDiscIds.every(
        (discId) =>
          this.getUniqueDiscSection(remotePost.content, discId) !== null,
      );
      if (insertedBlocksConfirmed && remotePost.content === content) {
        if (remotePost.status === 'publish') {
          this.newsService.invalidateWordPressAndNewsFeedCaches();
        }
        return;
      }

      throw this.uncertainWordPressResult(
        `post #${postId} does not exactly match the requested content`,
      );
    }
  }

  async createPostAndReconcile(
    title: string,
    content: string,
    status: 'draft' | 'publish',
    meta: Record<string, unknown>,
    categories: number[],
    tags: number[],
    slug: string,
  ): Promise<{ post: WpPost; reconciled: boolean }> {
    try {
      const post = await this.wordpressService.createPost(
        title,
        content,
        status,
        meta,
        categories,
        tags,
        slug,
      );
      if (post.status === 'publish') {
        this.newsService.invalidateWordPressAndNewsFeedCaches();
      }
      return { post, reconciled: false };
    } catch (error) {
      if (
        !(error instanceof WordpressWriteError) ||
        error.outcome !== 'unknown'
      ) {
        throw error;
      }

      let post: WpPost | null;
      try {
        post = await this.wordpressService.findPostBySlug(slug);
      } catch {
        throw this.uncertainWordPressResult(
          `post slug ${slug} could not be checked after the write`,
        );
      }

      if (!post) {
        throw this.uncertainWordPressResult(
          `post slug ${slug} was not found after an uncertain write`,
        );
      }
      if (post.status === 'trash') {
        throw new ConflictException(
          `WordPress post slug ${slug} is in the trash; review it manually before retrying`,
        );
      }

      if (post.status === 'publish') {
        this.newsService.invalidateWordPressAndNewsFeedCaches();
      }

      return { post, reconciled: true };
    }
  }

  uncertainWordPressResult(detail: string) {
    return new ServiceUnavailableException(
      `WordPress write outcome is unknown; verify ${detail} before retrying`,
    );
  }

  toPublishedDiscRecord(
    a: PublishableGutenbergDiscAssignment,
  ): PublishedDiscRecord {
    return {
      discId: a.disc.id,
      artist: a.disc?.artist?.name ?? '',
      name: a.disc?.name ?? '',
    };
  }

  async resolveSpotifyTrackId(
    a: PublishableGutenbergDiscAssignment,
  ): Promise<string | null> {
    if (a.spotifyTrackId) return a.spotifyTrackId;

    const artistName = a.disc?.artist?.name ?? '';
    const albumName = a.disc?.name ?? '';

    try {
      const albumTracks = await this.spotifyApiService.getAlbumTracks(
        artistName,
        albumName,
      );
      if (!albumTracks.length) return null;

      const singleNames = (
        await this.spotifyApiService.getArtistSingles(artistName)
      ).map((name) => name.toLowerCase());
      const matchedTrack = albumTracks.find((track) =>
        singleNames.includes(track.name.toLowerCase()),
      );
      if (matchedTrack) return matchedTrack.id;

      return (albumTracks[2] ?? albumTracks[albumTracks.length - 1]).id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`findTrackForAlbum failed: ${message}`);
      return null;
    }
  }

  async resolveAuthors(
    discs: GutenbergDiscAssignment[],
  ): Promise<({ name: string; link: string } | null)[]> {
    const cache = new Map<string, { name: string; link: string } | null>();

    return Promise.all(
      discs.map(async (a) => {
        const username = a.user?.username;
        if (!username) return null;
        if (cache.has(username)) return cache.get(username);

        const slug = username.toLowerCase().replace(/_/g, '-');
        const author = await this.wordpressService.findAuthorBySlug(slug);
        cache.set(username, author);
        return author;
      }),
    );
  }

  async syncDiscsIntoPost(
    wpPostId: number,
    currentContent: string,
    allDiscs: PublishableGutenbergDiscAssignment[],
    publishedDiscs: PublishedDiscRecord[],
    buildSections: DiscBlockBuilder,
    useAuthors: boolean,
    publicPost = true,
  ): Promise<{
    publishedDiscs: PublishedDiscRecord[];
    updatedContent: string;
    contentChanged: boolean;
    newCount: number;
    existingCount: number;
    removedDiscs: PublishedDiscRecord[];
    notFoundForUpdate: number;
    trackingChanged: boolean;
  }> {
    const publishedIds = new Set(publishedDiscs.map((d) => d.discId));
    const currentIds = new Set(allDiscs.map((a) => a.disc.id));
    const localDiscIds = new Set<string>();
    for (const asignation of allDiscs) {
      const discId = asignation.disc.id;
      if (localDiscIds.has(discId)) {
        throw new ConflictException(
          `WordPress block identity is ambiguous for disc ${discId}; review the post manually`,
        );
      }
      localDiscIds.add(discId);
    }

    const remoteBlocks = new Map<string, boolean>();
    for (const discId of new Set([...publishedIds, ...currentIds])) {
      remoteBlocks.set(
        discId,
        this.getUniqueDiscSection(currentContent, discId) !== null,
      );
    }

    const newDiscs = allDiscs.filter(
      (a) => !publishedIds.has(a.disc.id) && !remoteBlocks.get(a.disc.id),
    );
    const existingDiscs = allDiscs.filter(
      (a) =>
        publishedIds.has(a.disc.id) || remoteBlocks.get(a.disc.id) === true,
    );
    const reconciledDiscIds = allDiscs
      .filter(
        (a) => !publishedIds.has(a.disc.id) && remoteBlocks.get(a.disc.id),
      )
      .map((a) => a.disc.id);
    const removedDiscs = publishedDiscs.filter(
      (d) => !currentIds.has(d.discId),
    );

    let updatedContent = currentContent;
    let notFoundForUpdate = 0;

    const discsNeedingRender = [...newDiscs, ...existingDiscs];
    if (discsNeedingRender.length) {
      const [spotifyTrackIds, authors] = await Promise.all([
        Promise.all(
          discsNeedingRender.map((a) => this.resolveSpotifyTrackId(a)),
        ),
        useAuthors
          ? this.resolveAuthors(discsNeedingRender)
          : Promise.resolve(discsNeedingRender.map(() => null)),
      ]);

      if (newDiscs.length) {
        const newSections = buildSections(
          newDiscs,
          spotifyTrackIds.slice(0, newDiscs.length),
          authors.slice(0, newDiscs.length),
        );
        updatedContent = this.insertBeforeFooter(updatedContent, newSections);
      }

      existingDiscs.forEach((a, i) => {
        const offset = newDiscs.length + i;
        const block = buildSections(
          [a],
          [spotifyTrackIds[offset]],
          [authors[offset]],
        );
        const remoteBoundary = this.getUniqueDiscSection(
          updatedContent,
          a.disc.id,
        );
        if (!remoteBoundary) {
          notFoundForUpdate++;
          return;
        }
        updatedContent = this.replaceDiscSection(
          updatedContent,
          a.disc.id,
          block,
        );
      });

      if (updatedContent !== currentContent) {
        await this.updatePostContentWithReconciliation(
          wpPostId,
          updatedContent,
          newDiscs.map((a) => a.disc.id),
          publicPost,
        );
      }
    }

    const stillTracked = publishedDiscs.filter((d) => currentIds.has(d.discId));
    const trackedIds = new Set(stillTracked.map((d) => d.discId));
    const newlyTracked = allDiscs
      .filter((a) => !trackedIds.has(a.disc.id))
      .map((a) => this.toPublishedDiscRecord(a));
    const newPublishedDiscs = [...stillTracked, ...newlyTracked];
    const trackingChanged =
      reconciledDiscIds.length > 0 ||
      newDiscs.length > 0 ||
      removedDiscs.length > 0;

    return {
      publishedDiscs: newPublishedDiscs,
      updatedContent,
      contentChanged: updatedContent !== currentContent,
      newCount: newDiscs.length,
      existingCount: existingDiscs.length,
      removedDiscs,
      notFoundForUpdate,
      trackingChanged,
    };
  }

  insertBeforeFooter(content: string, addition: string): string {
    const markerIndex = this.findFooterMarkerIndex(content);
    if (markerIndex === -1) return `${content}\n\n${addition}`;
    return `${content.slice(0, markerIndex)}${addition}\n\n${content.slice(markerIndex)}`;
  }

  findFooterMarkerIndex(content: string): number {
    const separatorBlockRegex = /<!--\s*wp:separator[\s\S]*?-->/g;
    let match: RegExpExecArray | null;
    while ((match = separatorBlockRegex.exec(content)) !== null) {
      if (match[0].includes(FOOTER_MARKER_CLASS)) return match.index;
    }
    return -1;
  }

  findDiscSectionBoundaries(content: string): DiscSectionBoundary[] {
    const groupCommentRegex = /<!--\s*(\/?)wp:group\b[\s\S]*?-->/g;
    const boundaries: DiscSectionBoundary[] = [];
    const stack: { discId?: string; start: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = groupCommentRegex.exec(content)) !== null) {
      if (match[1]) {
        const open = stack.pop();
        if (open?.discId) {
          boundaries.push({
            discId: open.discId,
            start: open.start,
            end: match.index + match[0].length,
          });
        }
        continue;
      }
      const discIdMatch = match[0].match(/rv-disc-([0-9a-f-]+)/i);
      stack.push({ discId: discIdMatch?.[1], start: match.index });
    }
    return boundaries.sort((a, b) => a.start - b.start);
  }

  findDiscGroupMarkers(content: string, discId: string): number {
    const groupOpenRegex = /<!--\s*wp:group\b[\s\S]*?-->/g;
    let count = 0;
    let match: RegExpExecArray | null;
    while ((match = groupOpenRegex.exec(content)) !== null) {
      if (match[0].match(/rv-disc-([0-9a-f-]+)/i)?.[1] === discId) count++;
    }
    return count;
  }

  getUniqueDiscSection(
    content: string,
    discId: string,
  ): DiscSectionBoundary | null {
    const markerCount = this.findDiscGroupMarkers(content, discId);
    const boundaries = this.findDiscSectionBoundaries(content).filter(
      (boundary) => boundary.discId === discId,
    );
    if (markerCount !== boundaries.length || markerCount > 1) {
      throw new ConflictException(
        `WordPress block identity is ambiguous for disc ${discId}; review the post manually`,
      );
    }
    return boundaries[0] ?? null;
  }

  replaceDiscSection(
    content: string,
    discId: string,
    newBlock: string,
  ): string | null {
    const boundary = this.getUniqueDiscSection(content, discId);
    if (!boundary) return null;
    return `${content.slice(0, boundary.start)}${newBlock}${content.slice(boundary.end)}`;
  }
}
