import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeForSearch } from '../helpers/normalize-for-search';
import { Artist } from '../entities/artist.entity';
import { Disc } from '../../discs/entities/disc.entity';
import { NationalRelease } from '../../../national-releases/entities/national-release.entity';
import { SpotifyPlaylistArtist } from '../../../festival-playlists/entities/spotify-playlist-artist.entity';
import { ArtistOrphansService } from '../orphans/artist-orphans.service';

@Injectable()
export class ArtistManagementService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    @InjectRepository(NationalRelease)
    private readonly nationalReleaseRepository: Repository<NationalRelease>,
    @InjectRepository(SpotifyPlaylistArtist)
    private readonly playlistArtistRepository: Repository<SpotifyPlaylistArtist>,
    private readonly artistOrphansService: ArtistOrphansService,
  ) {}

  async findAllForManagement(
    query?: string,
    limit = 15,
    offset = 0,
    genreId?: string,
    needsReview?: boolean,
  ) {
    const qb = this.artistRepository
      .createQueryBuilder('artist')
      .leftJoinAndSelect('artist.country', 'country')
      .orderBy('artist.updatedAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (query) {
      qb.where('artist.name_normalized LIKE :q', {
        q: `%${normalizeForSearch(query)}%`,
      });
    }

    if (genreId) {
      qb.andWhere(
        (sub) =>
          `EXISTS (${sub.subQuery().select('1').from('disc', 'd').where('d.artistId = artist.id').andWhere('d.genreId = :genreId').getQuery()})`,
        { genreId },
      );
    }

    if (needsReview !== undefined) {
      qb.andWhere('artist.needsReview = :needsReview', { needsReview });
    }

    const countQb = this.artistRepository.createQueryBuilder('artist');
    if (query) {
      countQb.where('artist.name_normalized LIKE :q', {
        q: `%${normalizeForSearch(query)}%`,
      });
    }
    if (genreId) {
      countQb.andWhere(
        (sub) =>
          `EXISTS (${sub.subQuery().select('1').from('disc', 'd').where('d.artistId = artist.id').andWhere('d.genreId = :genreId').getQuery()})`,
        { genreId },
      );
    }
    if (needsReview !== undefined) {
      countQb.andWhere('artist.needsReview = :needsReview', { needsReview });
    }

    const [artists, totalItems, orphanCount] = await Promise.all([
      qb.getMany(),
      countQb.getCount(),
      this.artistOrphansService.countForManagement(query, needsReview),
    ]);

    if (artists.length === 0) {
      return {
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit,
        orphanCount: 0,
        data: [],
      };
    }

    const artistIds = artists.map((artist) => artist.id);
    const artistNames = artists.map((artist) => artist.name);

    const [discsRaw, nationalReleases, playlistAssociations] = await Promise.all([
      this.discRepository
        .createQueryBuilder('disc')
        .leftJoinAndSelect('disc.genre', 'genre')
        .leftJoinAndSelect('disc.artist', 'discArtist')
        .addSelect(
          (sub) =>
            sub
              .select('COUNT(rate.id)', 'rateCount')
              .from('rate', 'rate')
              .where('rate.discId = disc.id AND rate.rate IS NOT NULL'),
          'rateCount',
        )
        .addSelect(
          (sub) =>
            sub
              .select('AVG(rate.rate)', 'averageRate')
              .from('rate', 'rate')
              .where('rate.discId = disc.id AND rate.rate IS NOT NULL'),
          'averageRate',
        )
        .where('discArtist.id IN (:...artistIds)', { artistIds })
        .orderBy('disc.releaseDate', 'DESC')
        .getRawAndEntities(),

      this.nationalReleaseRepository
        .createQueryBuilder('nr')
        .where('LOWER(nr.artistName) IN (:...names)', {
          names: artistNames.map((name) => name.toLowerCase()),
        })
        .orderBy('nr.releaseDay', 'DESC')
        .getMany(),

      this.playlistArtistRepository
        .createQueryBuilder('association')
        .innerJoinAndSelect('association.spotify', 'playlist')
        .where('association.artistId IN (:...artistIds)', { artistIds })
        .orderBy('playlist.name', 'ASC')
        .getMany(),
    ]);

    const discsByArtist = new Map<string, any[]>();
    discsRaw.entities.forEach((disc, index) => {
      const artistId = disc.artist?.id;
      if (!artistId) return;
      if (!discsByArtist.has(artistId)) discsByArtist.set(artistId, []);
      discsByArtist.get(artistId).push({
        id: disc.id,
        name: disc.name,
        releaseDate: disc.releaseDate,
        ep: disc.ep,
        debut: disc.debut,
        image: disc.image,
        link: disc.link,
        genre: disc.genre
          ? {
              id: disc.genre.id,
              name: disc.genre.name,
              color: disc.genre.color,
            }
          : null,
        rateCount: parseInt(discsRaw.raw[index].rateCount, 10) || 0,
        averageRate:
          discsRaw.raw[index].averageRate != null
            ? parseFloat(discsRaw.raw[index].averageRate)
            : null,
      });
    });

    const releasesByArtistName = new Map<string, any[]>();
    nationalReleases.forEach((release) => {
      const key = release.artistName.toLowerCase();
      if (!releasesByArtistName.has(key)) releasesByArtistName.set(key, []);
      releasesByArtistName.get(key).push({
        id: release.id,
        discName: release.discName,
        discType: release.discType,
        genre: release.genre,
        releaseDay: release.releaseDay,
        approved: release.approved,
        link: release.link,
        discId: release.discId,
      });
    });

    const playlistsByArtist = new Map<string, any[]>();
    playlistAssociations.forEach((association) => {
      if (!playlistsByArtist.has(association.artistId)) {
        playlistsByArtist.set(association.artistId, []);
      }
      playlistsByArtist.get(association.artistId).push({
        id: association.spotify.id,
        name: association.spotify.name,
        link: association.spotify.link,
        type: association.spotify.type,
        imageUrl: association.spotify.imageUrl,
      });
    });

    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      orphanCount,
      data: artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        description: artist.description,
        image: artist.image,
        country: artist.country ?? null,
        discs: discsByArtist.get(artist.id) ?? [],
        nationalReleases:
          releasesByArtistName.get(artist.name.toLowerCase()) ?? [],
        spotifyPlaylists: playlistsByArtist.get(artist.id) ?? [],
      })),
    };
  }
}
