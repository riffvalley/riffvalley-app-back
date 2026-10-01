import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { AchievementMetricType } from '../enums/achievement-metric-type.enum';
import { CriteriaMatchesMetricType } from '../validators/criteria-matches-metric-type.validator';

export class CreateAchievementDto {
  @IsString()
  @MinLength(3)
  code: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsEnum(AchievementMetricType)
  metricType: AchievementMetricType;

  // Forma validada dinámicamente según `metricType` (ver validator).
  @CriteriaMatchesMetricType()
  criteria: Record<string, unknown>;

  // Obligatoria: todo logro nuevo pertenece a una categoría (organización
  // del catálogo). Puramente presentacional, no interviene en el evaluator.
  @IsUUID('4')
  categoryId: string;

  // Requerido si metricType = DISTINCT_ARTISTS_IN_GENRE, prohibido en el resto
  // (se valida a nivel de servicio, ver AchievementsService.resolveGenre).
  @IsOptional()
  @IsUUID('4')
  genreId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;

  @IsOptional()
  @IsBoolean()
  secret?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
