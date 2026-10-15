import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';

const toSafeIntegerQueryValue = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return Number.NaN;

  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) ? parsedValue : Number.NaN;
};

export class GenresQueryDto extends PaginationDto {
  @IsOptional()
  @Transform(({ obj, key }) => toSafeIntegerQueryValue(obj[key]))
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  limit?: number;

  @IsOptional()
  @Transform(({ obj, key }) => toSafeIntegerQueryValue(obj[key]))
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset?: number;
}
