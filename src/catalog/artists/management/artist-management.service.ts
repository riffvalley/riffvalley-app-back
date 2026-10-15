import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeForSearch } from '../helpers/normalize-for-search';
import { Artist } from '../entities/artist.entity';
import { Disc } from '../../discs/entities/disc.entity';
import { NationalRelease } from '../../../editorial/national-releases/entities/national-release.entity';
import { RiffValleyPlaylistArtist } from '../../../editorial/playlists/festival-playlists/entities/riff-valley-playlist-artist.entity';
import { RiffValleyPlaylist } from '../../../editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { ArtistOrphansService } from '../orphans/artist-orphans.service';
import {
  ArtistDiscProjection,
  DiscRateProjectionRaw,
  mapDiscProjection,
} from '../helpers/map-disc-projection';

type ManagementNationalReleaseProjection = Pick<
  NationalRelease,
  | 'id'
  | 'discName'
  | 'discType'
  | 'genre'
  | 'releaseDay'
  | 'approved'
  | 'link'
  | 'discId'
>;

type ManagementPlaylistProjection = Pick<
  RiffValleyPlaylist,
  'id' | 'name' | 'link' | 'type' | 'imageUrl'
>;

@Injectable()
export class ArtistManagementService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    @InjectRepository(NationalRelease)
    private readonly nationalReleaseRepository: Repository<NationalRelease>,
    @InjectRepository(RiffValleyPlaylistArtist)
    private readonly playlistArtistRepository: Repository<RiffValleyPlaylistArtist>,
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
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: Math.floor(offset / limit) + 1,
        limit,
        orphanCount,
        data: [],
      };
    }

    const artistIds = artists.map((artist) => artist.id);
    const artistNames = artists.map((artist) => artist.name);

    const [discsRaw, nationalReleases, playlistAssociations] =
      await Promise.all([
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
          .getRawAndEntities<DiscRateProjectionRaw>(),

        this.nationalReleaseRepository
          .createQueryBuilder('nr')
          .where('LOWER(nr.artistName) IN (:...names)', {
            names: artistNames.map((name) => name.toLowerCase()),
          })
          .orderBy('nr.releaseDay', 'DESC')
          .getMany(),

        this.playlistArtistRepository
          .createQueryBuilder('association')
          .innerJoinAndSelect('association.riffValleyPlaylist', 'playlist')
          .where('association.artistId IN (:...artistIds)', { artistIds })
          .orderBy('playlist.name', 'ASC')
          .getMany(),
      ]);

    const discsByArtist = new Map<string, ArtistDiscProjection[]>();
    discsRaw.entities.forEach((disc, index) => {
      const artistId = disc.artist?.id;
      if (!artistId) return;
      if (!discsByArtist.has(artistId)) discsByArtist.set(artistId, []);
      discsByArtist
        .get(artistId)
        .push(mapDiscProjection(disc, discsRaw.raw[index]));
    });

    const releasesByArtistName = new Map<
      string,
      ManagementNationalReleaseProjection[]
    >();
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

    const playlistsByArtist = new Map<string, ManagementPlaylistProjection[]>();
    playlistAssociations.forEach((association) => {
      if (!playlistsByArtist.has(association.artistId)) {
        playlistsByArtist.set(association.artistId, []);
      }
      playlistsByArtist.get(association.artistId).push({
        id: association.riffValleyPlaylist.id,
        name: association.riffValleyPlaylist.name,
        link: association.riffValleyPlaylist.link,
        type: association.riffValleyPlaylist.type,
        imageUrl: association.riffValleyPlaylist.imageUrl,
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
        riffValleyPlaylists: playlistsByArtist.get(artist.id) ?? [],
      })),
    };
  }
}
