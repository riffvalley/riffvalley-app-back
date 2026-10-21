import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

function transformPeriodInteger(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return Number.NaN;
  }

  return Number(value);
}

export class ListYearParamsDto {
  @Transform(({ value }) => transformPeriodInteger(value))
  @IsInt()
  @Min(100)
  @Max(275759)
  year: number;
}

export class ListYearMonthParamsDto extends ListYearParamsDto {
  @Transform(({ value }) => transformPeriodInteger(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}
