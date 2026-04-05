import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SuggestionPriority, SuggestionType } from '../entities/suggestion.entity';

export class CreateSuggestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsEnum(SuggestionType)
  @IsOptional()
  type?: SuggestionType;

  @IsEnum(SuggestionPriority)
  @IsOptional()
  priority?: SuggestionPriority;
}
