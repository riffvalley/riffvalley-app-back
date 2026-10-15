import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VideoStatus, VideoType } from '../entities/video.entity';

export class CreateVideoDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsEnum(VideoStatus)
  status: VideoStatus;

  @IsEnum(VideoType)
  type: VideoType;

  @IsISO8601()
  @IsOptional()
  updateDate?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsUUID()
  @IsOptional()
  editorId?: string;

  @IsUUID()
  @IsOptional()
  listId?: string;
}
