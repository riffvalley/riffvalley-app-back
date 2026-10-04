import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpotifyApiService } from 'src/wordpress/spotify-api.service';
import { Disc } from '../entities/disc.entity';

@Injectable()
export class DiscSpotifyService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    private readonly spotifyApiService: SpotifyApiService,
  ) {}

  // Tracklist de Spotify de un disco, para que el front deje elegir la
  // canción a embeber en los posts de WordPress en vez de que se elija
  // automáticamente.
  async getSpotifyTracks(id: string) {
    let disc: { name: string; artistName: string | null } | undefined;
    try {
      const row = await this.discRepository
        .createQueryBuilder('disc')
        .leftJoin('disc.artist', 'artist')
        .select('disc.name', 'disc_name')
        .addSelect('artist.name', 'artist_name')
        .where('disc.id = :id', { id })
        .getRawOne<{ disc_name: string; artist_name: string | null }>();
      disc = row
        ? { name: row.disc_name, artistName: row.artist_name }
        : undefined;
    } catch (error) {
      throw new NotFoundException(`Disc with id ${id} not found`);
    }

    if (!disc) throw new NotFoundException(`Disc with id ${id} not found`);

    return this.spotifyApiService.getAlbumTracks(
      disc.artistName ?? '',
      disc.name,
    );
  }
}
