import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const MAX_ARTIST_RESOLUTION_NAMES = 100;
export const MAX_ARTIST_RESOLUTION_NAME_LENGTH = 100;

export class ResolveArtistsBatchDto {
  @IsArray()
  @ArrayMaxSize(MAX_ARTIST_RESOLUTION_NAMES)
  @IsString({ each: true })
  @MaxLength(MAX_ARTIST_RESOLUTION_NAME_LENGTH, { each: true })
  @Matches(/\S/u, { each: true })
  names: string[];
}
