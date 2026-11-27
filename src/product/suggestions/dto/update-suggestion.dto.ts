import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SuggestionCategory,
  SuggestionPriority,
  SuggestionType,
} from '../entities/suggestion.entity';

export class UpdateSuggestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  description?: string;

  @IsEnum(SuggestionType)
  @IsOptional()
  type?: SuggestionType;

  @IsEnum(SuggestionPriority)
  @IsOptional()
  priority?: SuggestionPriority;

  @IsEnum(SuggestionCategory)
  @IsOptional()
  category?: SuggestionCategory | null;
}

export class RejectSuggestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rejectionReason: string;
}

export class DoneSuggestionDto {
  @IsUUID()
  @IsOptional()
  versionItemId?: string;
}
