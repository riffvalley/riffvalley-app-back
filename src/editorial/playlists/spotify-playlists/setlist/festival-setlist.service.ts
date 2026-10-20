import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeName } from '../helpers/normalize-name';

const SETLIST_API_URL = 'https://api.setlist.fm/rest/1.0';

interface SetlistSong {
  name?: string;
  tape?: boolean;
}

interface Setlist {
  id?: string;
  eventDate?: string;
  url?: string;
  sets?: { set?: { song?: SetlistSong[] }[] };
}

export interface TopSong {
  name: string;
  plays: number;
}

export interface TopSongsResult {
  artist: string;
  setlistsAnalyzed: number;
  songs: TopSong[];
  sources: string[];
}

@Injectable()
export class FestivalSetlistService {
  constructor(private readonly configService: ConfigService) {}

  async getTopSongs(
    artist: string,
    limit = 10,
    recentSetlists = 10,
  ): Promise<TopSongsResult> {
    const apiKey = this.requiredConfig('SETLISTFM_API_KEY');
    const params = new URLSearchParams({ artistName: artist, p: '1' });
    const response = await fetch(
      `${SETLIST_API_URL}/search/setlists?${params}`,
      {
        headers: { Accept: 'application/json', 'x-api-key': apiKey },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `setlist.fm respondió con ${response.status}`,
      );
    }

    const data = (await response.json()) as { setlist?: Setlist[] };
    const setlists = (data.setlist ?? [])
      .sort(
        (a, b) =>
          this.setlistTimestamp(b.eventDate) -
          this.setlistTimestamp(a.eventDate),
      )
      .filter((setlist) => this.songsFromSetlist(setlist).length > 0)
      .slice(0, recentSetlists);

    if (!setlists.length) {
      throw new NotFoundException(
        `No hay setlists recientes con canciones para ${artist}`,
      );
    }

    const counts = new Map<
      string,
      { name: string; plays: number; firstSeen: number }
    >();
    let position = 0;
    for (const setlist of setlists) {
      // Una canción cuenta una sola vez por concierto aunque aparezca repetida en el setlist.
      const songsInConcert = new Map<string, string>();
      for (const song of this.songsFromSetlist(setlist)) {
        const key = normalizeName(song.name);
        if (key && !song.tape && !songsInConcert.has(key))
          songsInConcert.set(key, song.name.trim());
      }
      for (const [key, name] of songsInConcert) {
        const current = counts.get(key);
        counts.set(
          key,
          current
            ? { ...current, plays: current.plays + 1 }
            : { name, plays: 1, firstSeen: position++ },
        );
      }
    }

    const songs: TopSong[] = [...counts.values()]
      .sort((a, b) => b.plays - a.plays || a.firstSeen - b.firstSeen)
      .slice(0, limit)
      .map(({ name, plays }) => ({ name, plays }));

    return {
      artist,
      setlistsAnalyzed: setlists.length,
      songs,
      sources: setlists.map((setlist) => setlist.url).filter(Boolean),
    };
  }

  private songsFromSetlist(setlist: Setlist): SetlistSong[] {
    return (setlist.sets?.set ?? [])
      .flatMap((set) => set.song ?? [])
      .filter((song) => song.name);
  }

  private setlistTimestamp(value?: string): number {
    if (!value) return 0;
    const [day, month, year] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  private requiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value)
      throw new InternalServerErrorException(`${name} no está configurada`);
    return value;
  }
}
