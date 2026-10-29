import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  LastfmAlbumResponse,
  LastfmArtistProfile,
  LastfmArtistProfileLookup,
  LastfmArtistResponse,
  LastfmArtistImageCandidate,
  LastfmArtistImageSearch,
} from './types/lastfm-api.types';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const ARTIST_IMAGE_SEARCH_TIMEOUT_MS = 1_000;

@Injectable()
export class LastfmApiService {
  private readonly apiKey = process.env.LASTFM_API_KEY;

  assertConfigured(): void {
    if (!this.apiKey) {
      throw new InternalServerErrorException('LASTFM_API_KEY not configured');
    }
  }

  async getArtistInfo(artist: string): Promise<object> {
    this.assertConfigured();

    const url = this.buildUrl('artist.getinfo', { artist });
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(
        `Last.fm responded with ${response.status}`,
      );
    }

    const data = (await response.json()) as LastfmArtistResponse;
    if (data.error) {
      throw new BadRequestException(data.message ?? 'Last.fm error');
    }

    return data.artist;
  }

  async lookupArtistProfile(
    artist: string,
  ): Promise<LastfmArtistProfileLookup> {
    if (!this.apiKey) return { status: 'not_configured' };

    let response: Response;
    try {
      response = await fetch(this.buildUrl('artist.getinfo', { artist }), {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return { status: 'unavailable' };
    }
    if (!response.ok) return { status: 'unavailable' };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: 'invalid_response' };
    }

    const record = asRecord(payload);
    if (!record) return { status: 'invalid_response' };
    if (record.error === 6) return { status: 'not_found' };
    if (record.error !== undefined) return { status: 'unavailable' };

    const profile = parseArtistProfile(record.artist);
    return profile
      ? { status: 'found', profile }
      : { status: 'invalid_response' };
  }

  async searchArtistImageCandidates(
    artist: string,
  ): Promise<LastfmArtistImageSearch> {
    if (!this.apiKey) return { status: 'not_configured' };

    let response: Response;
    try {
      response = await fetch(
        this.buildUrl('artist.search', { artist, limit: '5' }),
        { signal: AbortSignal.timeout(ARTIST_IMAGE_SEARCH_TIMEOUT_MS) },
      );
    } catch {
      return { status: 'unavailable' };
    }
    if (!response.ok) return { status: 'unavailable' };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: 'invalid_response' };
    }

    const root = asRecord(payload);
    if (!root || root.error !== undefined) return { status: 'unavailable' };
    const results = asRecord(root.results);
    const matches = asRecord(results?.artistmatches);
    if (!matches) return { status: 'invalid_response' };
    const rawCandidates = matches.artist;
    if (rawCandidates === undefined) {
      return { status: 'found', candidates: [] };
    }
    const values = Array.isArray(rawCandidates)
      ? rawCandidates
      : [rawCandidates];
    const candidates: LastfmArtistImageCandidate[] = [];
    for (const value of values) {
      const candidate = asRecord(value);
      if (!candidate || typeof candidate.name !== 'string') continue;
      candidates.push({
        name: candidate.name.trim(),
        imageUrl: parseArtistSearchImage(candidate),
      });
    }
    return { status: 'found', candidates };
  }

  async getAlbumImage(artist: string, album: string): Promise<string | null> {
    this.assertConfigured();

    try {
      const url = this.buildUrl('album.getinfo', { artist, album });
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = (await response.json()) as LastfmAlbumResponse;
      if (data.error || !data.album?.image) return null;

      const preferred = ['mega', 'extralarge', 'large'];
      for (const size of preferred) {
        const found = data.album.image.find(
          (image) => image.size === size && image['#text'],
        );
        if (found) return found['#text'];
      }
      return null;
    } catch {
      return null;
    }
  }

  private buildUrl(method: string, params: Record<string, string>): string {
    const query = [
      `method=${method}`,
      ...Object.entries(params).map(
        ([key, value]) => `${key}=${encodeURIComponent(value)}`,
      ),
      `api_key=${this.apiKey}`,
      'format=json',
    ];
    return `${LASTFM_BASE}?${query.join('&')}`;
  }
}

function parseArtistProfile(value: unknown): LastfmArtistProfile | null {
  const artist = asRecord(value);
  if (!artist || typeof artist.name !== 'string' || !artist.name.trim()) {
    return null;
  }

  const biography = asRecord(artist.bio);
  const biographyLinks = asRecord(biography?.links);
  const tags = asRecord(artist.tags);
  const similar = asRecord(artist.similar);
  const stats = asRecord(artist.stats);

  return {
    name: artist.name.trim(),
    url: nonEmptyString(artist.url),
    biographySummary: nonEmptyString(biography?.summary),
    biographyUrl: nonEmptyString(asRecord(biographyLinks?.link)?.href),
    tags: parseNamedLinks(tags?.tag),
    similarArtists: parseNamedLinks(similar?.artist),
    listeners: nonEmptyString(stats?.listeners),
    playCount: nonEmptyString(stats?.playcount),
  };
}

function parseNamedLinks(
  value: unknown,
): Array<{ name: string; url: string | null }> {
  const values = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  return values.flatMap((item) => {
    const record = asRecord(item);
    if (!record || typeof record.name !== 'string' || !record.name.trim()) {
      return [];
    }
    return [{ name: record.name.trim(), url: nonEmptyString(record.url) }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseArtistSearchImage(
  candidate: Record<string, unknown>,
): string | null {
  const imageValue = candidate.image;
  const imageObjects = Array.isArray(imageValue)
    ? imageValue
    : imageValue === undefined
      ? []
      : [imageValue];
  const sizedImage = imageObjects
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => value !== null)
    .sort((left, right) => imageSizeRank(right.size) - imageSizeRank(left.size))
    .map((value) => nonEmptyString(value['#text']))
    .find((url) => isUsableLastfmImage(url));
  const directImage = nonEmptyString(candidate.image);
  const smallImage = nonEmptyString(candidate.image_small);
  return (
    [sizedImage, directImage, smallImage].find(isUsableLastfmImage) ?? null
  );
}

function imageSizeRank(size: unknown): number {
  if (size === 'mega') return 5;
  if (size === 'extralarge') return 4;
  if (size === 'large') return 3;
  if (size === 'medium') return 2;
  return size === 'small' ? 1 : 0;
}

function isUsableLastfmImage(url: string | null): url is string {
  if (!url || url.includes('2a96cbd8b46e442fc41c2b86b821562f')) return false;
  return /^https?:\/\//i.test(url);
}
