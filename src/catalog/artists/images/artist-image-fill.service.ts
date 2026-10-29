import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  SpotifyArtistCandidate,
  SpotifyPublicApiService,
} from 'src/integrations/spotify-integration/api/spotify-public-api.service';
import { compareNormalizedMusicNames } from 'src/catalog/shared/music-name/normalize-music-name';
import { Artist } from '../entities/artist.entity';
import { FillArtistImagesDto } from './dto/fill-artist-images.dto';
import {
  ArtistImageFillBatchResult,
  ArtistImageFillCursor,
  ArtistImageFillPreview,
  ArtistImageFillResultItem,
} from './artist-image-fill.types';

const MAX_BATCH_SIZE = 10;
const DEFAULT_BATCH_SIZE = MAX_BATCH_SIZE;
const SPOTIFY_TIMEOUT_MS = 1500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class ArtistImageFillService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    private readonly spotifyApi: SpotifyPublicApiService,
  ) {}

  async preview(): Promise<ArtistImageFillPreview> {
    const eligible = await this.eligibleQuery().getCount();
    const upperBound = await this.highWatermark();
    return {
      eligible,
      batchSize: DEFAULT_BATCH_SIZE,
      estimatedBatches: Math.ceil(eligible / DEFAULT_BATCH_SIZE),
      startCursor: upperBound
        ? this.encodeCursor({
            version: 1,
            after: null,
            upperBound,
          })
        : null,
    };
  }

  async fill(dto: FillArtistImagesDto): Promise<ArtistImageFillBatchResult> {
    const batchSize = dto.batchSize ?? DEFAULT_BATCH_SIZE;
    const cursor = dto.cursor
      ? this.decodeCursor(dto.cursor)
      : await this.initialCursor();
    const artists = cursor.upperBound
      ? await this.nextArtists(cursor, batchSize)
      : [];
    const results: ArtistImageFillResultItem[] = [];

    for (const artist of artists) {
      results.push(await this.processArtist(artist));
    }

    const lastId = artists.at(-1)?.id ?? cursor.after;
    const nextCursor: ArtistImageFillCursor = {
      ...cursor,
      after: lastId,
    };
    const hasMore = lastId !== null && (await this.hasMore(nextCursor));
    const counts = results.reduce(
      (summary, result) => {
        if (result.outcome === 'updated') summary.updated += 1;
        else if (result.outcome === 'not_found') summary.notFound += 1;
        else if (result.outcome === 'ambiguous') summary.ambiguous += 1;
        else if (result.outcome === 'concurrent_update') {
          summary.concurrentUpdates += 1;
        } else summary.failed += 1;
        return summary;
      },
      {
        updated: 0,
        notFound: 0,
        ambiguous: 0,
        failed: 0,
        concurrentUpdates: 0,
      },
    );

    return {
      processed: results.length,
      ...counts,
      results,
      nextCursor: hasMore ? this.encodeCursor(nextCursor) : null,
      hasMore,
    };
  }

  private async processArtist(
    artist: Artist,
  ): Promise<ArtistImageFillResultItem> {
    let candidates: SpotifyArtistCandidate[];
    try {
      candidates = await this.spotifyApi.findArtistCandidates(
        artist.name,
        SPOTIFY_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          artistId: artist.id,
          outcome: 'not_found',
          reason: 'no_name_match',
        };
      }
      return {
        artistId: artist.id,
        outcome: 'failed',
        reason: 'provider_error',
      };
    }

    const matches = candidates.filter((candidate) =>
      compareNormalizedMusicNames(artist.name, candidate.name),
    );
    if (matches.length === 0) {
      return {
        artistId: artist.id,
        outcome: 'not_found',
        reason: 'no_name_match',
      };
    }
    if (matches.length > 1) {
      return {
        artistId: artist.id,
        outcome: 'ambiguous',
        reason: 'multiple_name_matches',
      };
    }

    const image = matches[0].imageUrl;
    if (!image) {
      return {
        artistId: artist.id,
        outcome: 'not_found',
        reason: 'no_image_available',
      };
    }

    const result = await this.artistRepository
      .createQueryBuilder()
      .update(Artist)
      .set({ image })
      .where('id = :id', { id: artist.id })
      .andWhere("(image IS NULL OR BTRIM(image) = '')")
      .execute();

    return result.affected === 1
      ? { artistId: artist.id, outcome: 'updated' }
      : {
          artistId: artist.id,
          outcome: 'concurrent_update',
          reason: 'image_already_set',
        };
  }

  private eligibleQuery(): SelectQueryBuilder<Artist> {
    return this.artistRepository
      .createQueryBuilder('artist')
      .select(['artist.id', 'artist.name', 'artist.image'])
      .where("(artist.image IS NULL OR BTRIM(artist.image) = '')");
  }

  private async highWatermark(): Promise<string | null> {
    const raw = await this.artistRepository
      .createQueryBuilder('artist')
      .select('artist.id', 'maxId')
      .orderBy('artist.id', 'DESC')
      .take(1)
      .getRawOne<{ maxId: string | null }>();
    return raw?.maxId ?? null;
  }

  private async initialCursor(): Promise<ArtistImageFillCursor> {
    return { version: 1, after: null, upperBound: await this.highWatermark() };
  }

  private async nextArtists(
    cursor: ArtistImageFillCursor,
    batchSize: number,
  ): Promise<Artist[]> {
    const query = this.eligibleQuery()
      .andWhere('artist.id <= :upperBound', { upperBound: cursor.upperBound })
      .orderBy('artist.id', 'ASC')
      .take(batchSize);
    if (cursor.after)
      query.andWhere('artist.id > :after', { after: cursor.after });
    return query.getMany();
  }

  private async hasMore(cursor: ArtistImageFillCursor): Promise<boolean> {
    if (!cursor.upperBound || !cursor.after) return false;
    return this.eligibleQuery()
      .andWhere('artist.id > :after', { after: cursor.after })
      .andWhere('artist.id <= :upperBound', { upperBound: cursor.upperBound })
      .getExists();
  }

  private decodeCursor(value: string): ArtistImageFillCursor {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString(),
      );
      if (
        !isRecord(parsed) ||
        parsed.version !== 1 ||
        (parsed.after !== null &&
          (typeof parsed.after !== 'string' ||
            !UUID_PATTERN.test(parsed.after))) ||
        (parsed.upperBound !== null &&
          (typeof parsed.upperBound !== 'string' ||
            !UUID_PATTERN.test(parsed.upperBound)))
      ) {
        throw new Error('Invalid cursor shape');
      }
      return {
        version: 1,
        after: typeof parsed.after === 'string' ? parsed.after : null,
        upperBound:
          typeof parsed.upperBound === 'string' ? parsed.upperBound : null,
      };
    } catch {
      throw new BadRequestException('Cursor de imágenes de artistas no válido');
    }
  }

  private encodeCursor(cursor: ArtistImageFillCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }
}
