import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class SelectPlaylistArtistTracksDto {
  @IsUUID('4')
  artistId: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9]+$/, { each: true })
  spotifyTrackIds: string[];
}

export class ReplacePlaylistArtistTracksDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9]+$/, { each: true })
  spotifyTrackIds: string[];
}

export class ReplaceFailedFestivalArtistTracksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9]+$/, { each: true })
  spotifyTrackIds: string[];
}
