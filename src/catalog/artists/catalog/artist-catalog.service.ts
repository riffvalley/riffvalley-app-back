import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { Artist } from '../entities/artist.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { normalizeForSearch } from '../helpers/normalize-for-search';
import {
  compareNormalizedMusicNames,
  normalizeMusicName,
} from '../../shared/music-name/normalize-music-name';
import { getMusicNameSearchKeys } from '../../shared/music-name/music-name-search';
import {
  ArtistCatalogDiscSummary,
  ArtistCatalogNameMatch,
} from './artist-catalog.types';

type ArtistCatalogDiscRow = {
  artistId: string;
  id: string;
  name: string;
  image: string | null;
  releaseYear: number | string | null;
};

@Injectable()
export class ArtistCatalogService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: Pick<Repository<Disc>, 'query'>,
  ) {}

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [artists, totalItems] = await this.artistRepository.findAndCount({
      take: limit,
      skip: offset,
    });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: artists,
    };
  }

  async findOne(id: string): Promise<Artist> {
    try {
      const artist = await this.artistRepository.findOneByOrFail({ id });
      return artist;
    } catch (error) {
      throw new NotFoundException(`Artist with id ${id} not found`);
    }
  }

  async findIdentityById(
    id: string,
  ): Promise<Pick<Artist, 'id' | 'name'> | null> {
    const artist = await this.artistRepository.findOne({
      where: { id },
      select: { id: true, name: true },
    });
    return artist ? { id: artist.id, name: artist.name } : null;
  }

  async findExactNameMatches(
    names: string[],
  ): Promise<ArtistCatalogNameMatch[]> {
    const matchedArtists = await this.findExactArtistIdentities(names);
    const artistIds = [
      ...new Set(
        matchedArtists.flatMap((artist) => (artist ? [artist.id] : [])),
      ),
    ];
    if (!artistIds.length) return names.map(() => emptyNameMatch());

    const discRows = (await this.discRepository.query(
      `
      SELECT
        disc."artistId" AS "artistId",
        disc.id AS id,
        disc.name AS name,
        disc.image AS image,
        CASE
          WHEN disc."releaseDate" IS NULL THEN NULL
          ELSE EXTRACT(YEAR FROM disc."releaseDate")::int
        END AS "releaseYear"
      FROM disc
      WHERE disc."artistId" = ANY($1::uuid[])
      ORDER BY
        disc."artistId" ASC,
        disc."releaseDate" DESC NULLS LAST,
        disc.name ASC,
        disc.id ASC
      `,
      [artistIds],
    )) as ArtistCatalogDiscRow[];

    const discsByArtist = new Map<
      string,
      Map<string, ArtistCatalogDiscSummary>
    >();
    for (const row of discRows) {
      const discs = discsByArtist.get(row.artistId) ?? new Map();
      if (!discs.has(row.id)) {
        discs.set(row.id, {
          id: row.id,
          name: row.name,
          image: row.image,
          releaseYear:
            row.releaseYear === null ? null : Number(row.releaseYear),
        });
      }
      discsByArtist.set(row.artistId, discs);
    }

    return matchedArtists.map((artist) => {
      if (!artist) return emptyNameMatch();
      const catalogDiscs = [...(discsByArtist.get(artist.id)?.values() ?? [])];
      return {
        catalogArtistId: artist.id,
        catalogDiscCount: catalogDiscs.length,
        catalogDiscs,
      };
    });
  }

  async resolveExactNames(
    names: string[],
  ): Promise<Array<Pick<Artist, 'id' | 'name'> | null>> {
    return this.findExactArtistIdentities(names);
  }

  async inspectExactNames(names: string[]) {
    const candidatesByInput = await this.findExactArtistCandidates(names);

    return names.map((name, index) => {
      if (!normalizeMusicName(name))
        return {
          status: 'invalid' as const,
          code: 'ARTIST_NAME_INVALID',
          candidates: [],
        };
      const matches = candidatesByInput[index];
      if (matches.length > 1)
        return {
          status: 'ambiguous' as const,
          code: 'ARTIST_AMBIGUOUS',
          candidates: matches.map(({ id, name: canonicalName }) => ({
            id,
            name: canonicalName,
          })),
        };
      return matches[0]
        ? {
            status: 'existing' as const,
            entity: { id: matches[0].id, name: matches[0].name },
            candidates: [],
          }
        : { status: 'new' as const, candidates: [] };
    });
  }

  private async findExactArtistIdentities(
    names: string[],
  ): Promise<Array<Pick<Artist, 'id' | 'name'> | null>> {
    const candidatesByInput = await this.findExactArtistCandidates(names);
    return candidatesByInput.map((matches) =>
      matches.length === 1 ? matches[0] : null,
    );
  }

  private async findExactArtistCandidates(
    names: string[],
  ): Promise<Array<Array<Pick<Artist, 'id' | 'name'>>>> {
    const searchKeys = [
      ...new Set(names.flatMap(getMusicNameSearchKeys).filter(Boolean)),
    ];
    if (!searchKeys.length) return names.map(() => []);
    const legacySearchKeys = [
      ...new Set(
        searchKeys
          .map((key) => normalizeForSearch(key.normalize('NFKC')))
          .filter(Boolean),
      ),
    ];

    const candidates = await this.artistRepository
      .createQueryBuilder('artist')
      .select(['artist.id', 'artist.name'])
      .where(
        '(artist.search_name_normalized IN (:...searchKeys) OR (artist.search_name_normalized IS NULL AND artist.nameNormalized IN (:...legacySearchKeys)))',
        { searchKeys, legacySearchKeys },
      )
      .getMany();

    return names.map((name) =>
      normalizeMusicName(name)
        ? candidates.filter((candidate) =>
            compareNormalizedMusicNames(name, candidate.name),
          )
        : [],
    );
  }
}

function emptyNameMatch(): ArtistCatalogNameMatch {
  return {
    catalogArtistId: null,
    catalogDiscCount: 0,
    catalogDiscs: [],
  };
}
