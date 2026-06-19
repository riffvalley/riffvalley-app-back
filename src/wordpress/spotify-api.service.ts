import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SpotifyApiService {
  private readonly logger = new Logger('SpotifyApiService');
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('SPOTIFY_CLIENT_SECRET', '');
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);

    const data: any = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async get(path: string): Promise<any> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      this.logger.warn(`Spotify API ${path} → ${res.status}`);
      return null;
    }
    return res.json();
  }

  async findTrackForAlbum(artistName: string, albumName: string): Promise<string | null> {
    try {
      // 1. Buscar el álbum y obtener sus tracks
      const albumSearch = await this.get(
        `/search?q=album:${encodeURIComponent(albumName)}+artist:${encodeURIComponent(artistName)}&type=album&limit=1`,
      );
      const album = albumSearch?.albums?.items?.[0];
      if (!album) return null;

      const tracksData = await this.get(`/albums/${album.id}/tracks?limit=50`);
      const albumTracks: { id: string; name: string }[] = tracksData?.items ?? [];
      if (!albumTracks.length) return null;

      // 2. Buscar singles del artista
      const artistSearch = await this.get(
        `/search?q=artist:${encodeURIComponent(artistName)}&type=artist&limit=1`,
      );
      const artist = artistSearch?.artists?.items?.[0];

      if (artist) {
        const singlesData = await this.get(
          `/artists/${artist.id}/albums?include_groups=single&market=ES&limit=50`,
        );
        const singleNames: string[] = (singlesData?.items ?? []).map((s: any) =>
          s.name.toLowerCase(),
        );

        // 3. Si algún single coincide con un track del álbum, devolver ese track del álbum
        const matchedTrack = albumTracks.find((t) =>
          singleNames.includes(t.name.toLowerCase()),
        );
        if (matchedTrack) return matchedTrack.id;
      }

      // 4. Sin single → devolver el 3er track (o el último si hay menos de 3)
      return (albumTracks[2] ?? albumTracks[albumTracks.length - 1]).id;
    } catch (err) {
      this.logger.error(`findTrackForAlbum failed: ${err.message}`);
      return null;
    }
  }
}
