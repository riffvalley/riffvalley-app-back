import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

function transformCalendarInteger(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : Number.NaN;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  return Number.NaN;
}

export class FindContentByMonthQueryDto {
  @Transform(({ value }) => transformCalendarInteger(value))
  @IsInt()
  @Min(100)
  @Max(275759)
  year: number;

  @Transform(({ value }) => transformCalendarInteger(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}
