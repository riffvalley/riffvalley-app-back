import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SpotifyStatus, SpotifyType } from '../entities/spotify.entity';

export class CreateSpotifyDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsEnum(SpotifyStatus)
  status: SpotifyStatus;

  @IsUrl()
  @MaxLength(500)
  link: string;

  @IsEnum(SpotifyType)
  type: SpotifyType;

  @IsISO8601()
  updateDate: string; // vendrá como ISO8601

  @IsUUID()
  @IsOptional()
  userId?: string;
}
