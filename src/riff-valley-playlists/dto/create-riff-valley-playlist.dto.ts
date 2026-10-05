import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { RiffValleyPlaylistStatus, RiffValleyPlaylistType } from '../entities/riff-valley-playlist.entity';

export class CreateRiffValleyPlaylistDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsEnum(RiffValleyPlaylistStatus)
  status: RiffValleyPlaylistStatus;

  @IsUrl()
  @MaxLength(500)
  link: string;

  @IsEnum(RiffValleyPlaylistType)
  type: RiffValleyPlaylistType;

  @IsISO8601()
  updateDate: string; // vendrá como ISO8601

  @IsUUID()
  @IsOptional()
  userId?: string;
}
