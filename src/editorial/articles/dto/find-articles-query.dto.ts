import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ArticleStatus } from '../entities/article.entity';

const toSafeIntegerQueryValue = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return Number.NaN;

  const normalizedValue = value.trim();
  if (normalizedValue === '') return 0;
  if (!/^-?\d+$/.test(normalizedValue)) return Number.NaN;

  const parsedValue = Number(normalizedValue);
  return Number.isSafeInteger(parsedValue) ? parsedValue : Number.NaN;
};

const emptyStringToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

export class FindArticlesQueryDto {
  @IsOptional()
  @Transform(({ obj, key }) => toSafeIntegerQueryValue(obj[key]))
  @IsInt()
  @Min(Number.MIN_SAFE_INTEGER)
  @Max(Number.MAX_SAFE_INTEGER)
  limit?: number;

  @IsOptional()
  @Transform(({ obj, key }) => toSafeIntegerQueryValue(obj[key]))
  @IsInt()
  @Min(Number.MIN_SAFE_INTEGER)
  @Max(Number.MAX_SAFE_INTEGER)
  offset?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ obj, key }) => emptyStringToUndefined(obj[key]))
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @Transform(({ obj, key }) => emptyStringToUndefined(obj[key]))
  @IsUUID()
  userId?: string;
}
