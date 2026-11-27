import { Allow, IsIn, IsOptional } from 'class-validator';
import {
  SuggestionCategory,
  SuggestionCategoryFilter,
  SuggestionStatus,
  SuggestionType,
} from '../entities/suggestion.entity';

export class SuggestionsQueryDto {
  @Allow()
  type?: SuggestionType;

  @Allow()
  status?: SuggestionStatus;

  @IsIn([...Object.values(SuggestionCategory), 'uncategorized'])
  @IsOptional()
  category?: SuggestionCategoryFilter;
}
