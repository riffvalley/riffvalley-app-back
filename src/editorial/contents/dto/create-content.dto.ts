import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsDateString,
  IsUUID,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { ContentType } from '../entities/content.entity';

export class CreateContentDto {
  @IsEnum(ContentType)
  type: ContentType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  publicationDate?: string;

  @IsDateString()
  @IsOptional()
  closeDate?: string;

  @IsDateString()
  @IsOptional()
  listDate?: string;

  @IsUUID()
  authorId: string;

  @IsOptional()
  @IsUUID()
  reunionId?: string;

  @IsOptional()
  @IsUUID()
  riffValleyPlaylistId?: string;

  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsOptional()
  @IsUUID()
  videoId?: string;

  // Preserve the input JSON type despite the global implicit conversion.
  // Transform null to a non-boolean value so PartialType's IsOptional does
  // not skip validation for PATCH requests.
  @Type(() => Object)
  @Transform(({ obj, key }) => (obj?.[key] === null ? 'null' : obj?.[key]))
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  ready?: boolean;

  @Type(() => Object)
  @Transform(({ obj, key }) => (obj?.[key] === null ? 'null' : obj?.[key]))
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  backlog?: boolean;
}
