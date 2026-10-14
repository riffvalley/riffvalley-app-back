import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchSpotifyTracksQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  q?: string;
}
