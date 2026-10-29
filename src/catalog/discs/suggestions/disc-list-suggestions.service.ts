import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Artist } from '../../artists/entities/artist.entity';
import { normalizeForSearch } from '../../artists/helpers/normalize-for-search';
import { Disc } from '../entities/disc.entity';
import {
  buildMusicNameMultiColumnPartialPredicate,
  buildMusicNamePartialPredicate,
} from '../../shared/music-name/music-name-search';
import { normalizeMusicName } from '../../shared/music-name/normalize-music-name';
import { buildMusicNameSuggestionRank } from '../../shared/music-name/music-name-suggestion-rank';
import { DiscListSuggestionsResponse } from './disc-list-suggestions.types';

const MIN_NORMALIZED_CHARACTERS = 2;
const ARTIST_SUGGESTION_LIMIT = 3;
const DISC_SUGGESTION_LIMIT = 5;

export type MusicSuggestionQueryBuilder<Entity> = Pick<
  SelectQueryBuilder<Entity>,
  | 'select'
  | 'addSelect'
  | 'where'
  | 'andWhere'
  | 'innerJoin'
  | 'orderBy'
  | 'addOrderBy'
  | 'take'
  | 'getRawMany'
>;

export interface MusicSuggestionQueryRepository<Entity> {
  createQueryBuilder(alias: string): MusicSuggestionQueryBuilder<Entity>;
}

interface ArtistSuggestionRow {
  id: string;
  name: string;
  image: string | null;
}

interface DiscSuggestionRow {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  image: string | null;
}

@Injectable()
export class DiscListSuggestionsService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: MusicSuggestionQueryRepository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: MusicSuggestionQueryRepository<Disc>,
  ) {}

  async findSuggestions(query?: string): Promise<DiscListSuggestionsResponse> {
    const text = query?.trim() ?? '';
    const normalized = normalizeMusicName(text);
    if (Array.from(normalized).length < MIN_NORMALIZED_CHARACTERS) {
      return { artists: [], discs: [] };
    }

    const [artists, discs] = await Promise.all([
      this.findArtistSuggestions(text),
      this.findDiscSuggestions(text),
    ]);
    return { artists, discs };
  }

  private async findArtistSuggestions(
    query: string,
  ): Promise<ArtistSuggestionRow[]> {
    const search = buildMusicNamePartialPredicate(
      query,
      'artist.search_name_normalized',
      'artist.name_normalized',
      normalizeForSearch(query),
      'artistSuggestionSearch',
    );
    const rank = buildMusicNameSuggestionRank(
      query,
      [[{ normalizedColumn: 'artist.search_name_normalized' }]],
      'artistSuggestionRank',
    );

    return this.artistRepository
      .createQueryBuilder('artist')
      .select('artist.id', 'id')
      .addSelect('artist.name', 'name')
      .addSelect('artist.image', 'image')
      .addSelect(rank.expression, 'suggestionRank')
      .where(search.predicate, { ...search.parameters, ...rank.parameters })
      .orderBy('suggestionRank', 'ASC')
      .addOrderBy('artist.name', 'ASC')
      .addOrderBy('artist.id', 'ASC')
      .take(ARTIST_SUGGESTION_LIMIT)
      .getRawMany<ArtistSuggestionRow>();
  }

  private async findDiscSuggestions(
    query: string,
  ): Promise<DiscSuggestionRow[]> {
    const search = buildMusicNameMultiColumnPartialPredicate(
      query,
      [
        {
          normalizedColumn: 'disc.search_name_normalized',
          legacyColumn: 'disc.name',
          legacyValue: query,
          legacyOperator: 'ILIKE',
        },
        {
          normalizedColumn: 'artist.search_name_normalized',
          legacyColumn: 'artist.name_normalized',
          legacyValue: normalizeForSearch(query),
          legacyOperator: 'ILIKE',
        },
      ],
      'discSuggestionSearch',
    );
    const rank = buildMusicNameSuggestionRank(
      query,
      [
        [{ normalizedColumn: 'disc.search_name_normalized' }],
        [{ normalizedColumn: 'artist.search_name_normalized' }],
      ],
      'discSuggestionRank',
    );

    return this.discRepository
      .createQueryBuilder('disc')
      .innerJoin('disc.artist', 'artist')
      .select('disc.id', 'id')
      .addSelect('disc.name', 'title')
      .addSelect('artist.id', 'artistId')
      .addSelect('artist.name', 'artistName')
      .addSelect('disc.image', 'image')
      .addSelect(rank.expression, 'suggestionRank')
      .where(search.predicate, { ...search.parameters, ...rank.parameters })
      .andWhere('disc.releaseDate <= :suggestionToday', {
        suggestionToday: new Date(),
      })
      .orderBy('suggestionRank', 'ASC')
      .addOrderBy('disc.name', 'ASC')
      .addOrderBy('artist.name', 'ASC')
      .addOrderBy('disc.id', 'ASC')
      .take(DISC_SUGGESTION_LIMIT)
      .getRawMany<DiscSuggestionRow>();
  }
}
