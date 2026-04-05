import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SuggestionPriority } from '../entities/suggestion.entity';

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

  @IsEnum(SuggestionPriority)
  @IsOptional()
  priority?: SuggestionPriority;
}

export class RejectSuggestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rejectionReason: string;
}

export class DoneSuggestionDto {
  @IsUUID()
  versionItemId: string;
}
