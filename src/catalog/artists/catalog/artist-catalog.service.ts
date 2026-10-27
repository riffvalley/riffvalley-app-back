import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { Artist } from '../entities/artist.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { normalizeForSearch } from '../helpers/normalize-for-search';
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
    const searchKeys = [
      ...new Set(
        names
          .map((name) => normalizeForSearch(name.normalize('NFKC')))
          .filter(Boolean),
      ),
    ];
    if (!searchKeys.length) return names.map(() => emptyNameMatch());

    const candidates = await this.artistRepository
      .createQueryBuilder('artist')
      .select(['artist.id', 'artist.name'])
      .where('artist.nameNormalized IN (:...searchKeys)', { searchKeys })
      .getMany();

    const candidatesByName = new Map<string, Artist[]>();
    for (const candidate of candidates) {
      const key = normalizeCatalogName(candidate.name);
      const grouped = candidatesByName.get(key) ?? [];
      grouped.push(candidate);
      candidatesByName.set(key, grouped);
    }

    const matchedArtists = names.map((name) => {
      const matched = candidatesByName.get(normalizeCatalogName(name)) ?? [];
      return matched.length === 1 ? matched[0] : null;
    });
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
}

function normalizeCatalogName(value: string): string {
  return normalizeForSearch(value.normalize('NFKC'));
}

function emptyNameMatch(): ArtistCatalogNameMatch {
  return {
    catalogArtistId: null,
    catalogDiscCount: 0,
    catalogDiscs: [],
  };
}
