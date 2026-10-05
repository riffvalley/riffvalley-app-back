import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export const SPOTIFY_ALBUM_GROUPS = [
  'album',
  'single',
  'compilation',
  'appears_on',
] as const;

export type SpotifyAlbumGroup = (typeof SPOTIFY_ALBUM_GROUPS)[number];

export class ListSpotifyArtistAlbumsQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((group) => group.trim()) : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(SPOTIFY_ALBUM_GROUPS.length)
  @IsIn(SPOTIFY_ALBUM_GROUPS, { each: true })
  include_groups: SpotifyAlbumGroup[] = ['album', 'single'];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 1;
}
