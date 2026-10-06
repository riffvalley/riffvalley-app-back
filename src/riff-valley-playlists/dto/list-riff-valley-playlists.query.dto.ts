// src/riff-valley-playlists/dto/list-riff-valley-playlists.query.dto.ts
import {
  IsInt,
  IsOptional,
  IsString,
  IsISO8601,
  Max,
  Min,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const ESTADOS = [
  'not_started',
  'in_progress',
  'editing',
  'ready',
  'published',
] as const;
const TIPOS = ['festival', 'especial', 'genero', 'otras'] as const;
type RiffValleyPlaylistStatus = (typeof ESTADOS)[number];
type RiffValleyPlaylistType = (typeof TIPOS)[number];

export class ListRiffValleyPlaylistsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(ESTADOS as readonly string[])
  status?: RiffValleyPlaylistStatus;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(TIPOS as readonly string[])
  type?: RiffValleyPlaylistType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;
}
