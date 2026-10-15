import { Disc } from '../../discs/entities/disc.entity';
import { Genre } from '../../genres/entities/genre.entity';

export interface DiscRateProjectionRaw {
  rateCount?: string | number | null;
  averageRate?: string | number | null;
}

export interface ArtistDiscProjection {
  id: Disc['id'];
  name: Disc['name'];
  releaseDate: Disc['releaseDate'];
  ep: Disc['ep'];
  debut: Disc['debut'];
  image: Disc['image'];
  link: Disc['link'];
  genre: Pick<Genre, 'id' | 'name' | 'color'> | null;
  rateCount: number;
  averageRate: number | null;
}

export function mapDiscProjection(
  disc: Disc,
  raw: DiscRateProjectionRaw,
): ArtistDiscProjection {
  return {
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
    rateCount: parseInt(String(raw.rateCount), 10) || 0,
    averageRate:
      raw.averageRate != null ? parseFloat(String(raw.averageRate)) : null,
  };
}
