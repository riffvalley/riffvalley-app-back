import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sanitizeHtml = require('sanitize-html');
import { Repository } from 'typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { LastfmApiService } from 'src/integrations/lastfm-integration/lastfm-api.service';
import { LastfmArtistProfileLookup } from 'src/integrations/lastfm-integration/types/lastfm-api.types';
import { RatesArtistLastfmResponseDto } from '../dto/rates-artist-lastfm.dto';

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};
const LASTFM_LIST_LIMIT = 5;
const BIOGRAPHY_MAX_LENGTH = 1_200;

@Injectable()
export class RatesArtistLastfmService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Pick<Repository<Artist>, 'findOne'>,
    private readonly lastfmApiService: LastfmApiService,
  ) {}

  async getArtistInfo(artistId: string): Promise<RatesArtistLastfmResponseDto> {
    const artist = await this.artistRepository.findOne({
      where: { id: artistId },
      select: { id: true, name: true },
    });
    if (!artist) {
      throw new NotFoundException(`Artist with id ${artistId} not found`);
    }

    const lookup = await this.lastfmApiService.lookupArtistProfile(artist.name);
    if (lookup.status !== 'found') {
      return emptyResponse(artist.id, lookup.status);
    }

    if (normalizeName(lookup.profile.name) !== normalizeName(artist.name)) {
      return emptyResponse(artist.id, 'not_found');
    }

    return mapProfile(artist.id, lookup);
  }
}

function emptyResponse(
  artistId: string,
  status: Exclude<LastfmArtistProfileLookup['status'], 'found'>,
): RatesArtistLastfmResponseDto {
  return {
    artistId,
    status,
    biography: null,
    tags: [],
    similarArtists: [],
    listeners: null,
    playCount: null,
    lastfmUrl: null,
  };
}

function mapProfile(
  artistId: string,
  lookup: Extract<LastfmArtistProfileLookup, { status: 'found' }>,
): RatesArtistLastfmResponseDto {
  const profile = lookup.profile;
  const summary = profile.biographySummary
    ? sanitizeHtml(profile.biographySummary, PLAIN_TEXT_OPTIONS)
        .trim()
        .slice(0, BIOGRAPHY_MAX_LENGTH) || null
    : null;
  const biographyUrl = safeLastfmUrl(profile.biographyUrl);
  const lastfmUrl = safeLastfmUrl(profile.url);

  return {
    artistId,
    status: 'available',
    biography:
      summary || biographyUrl
        ? { summary, url: biographyUrl ?? lastfmUrl }
        : null,
    tags: uniqueLinks(profile.tags),
    similarArtists: uniqueLinks(profile.similarArtists),
    listeners: parseCount(profile.listeners),
    playCount: parseCount(profile.playCount),
    lastfmUrl,
  };
}

function uniqueLinks(
  values: Array<{ name: string; url: string | null }>,
): Array<{ name: string; url: string | null }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; url: string | null }> = [];

  for (const value of values) {
    const key = normalizeName(value.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ name: value.name, url: safeLastfmUrl(value.url) });
    if (result.length === LASTFM_LIST_LIMIT) break;
  }
  return result;
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function safeLastfmUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['last.fm', 'www.last.fm'].includes(hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return null;
    }
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

function parseCount(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}
