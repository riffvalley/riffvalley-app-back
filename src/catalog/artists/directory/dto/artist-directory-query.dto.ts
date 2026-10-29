import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const ARTIST_DIRECTORY_LETTERS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '#',
] as const;

export class ArtistDirectoryQueryDto {
  @IsOptional()
  @IsIn(ARTIST_DIRECTORY_LETTERS)
  letter = 'A';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
