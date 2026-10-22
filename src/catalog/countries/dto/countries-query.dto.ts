import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class CountriesQueryDto extends PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  @Transform(({ obj }) => {
    const value = obj?.offset;

    if (value === undefined) return undefined;
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value >= 0 ? value : Number.NaN;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      return Number.NaN;
    }

    const offset = Number(value);
    return Number.isSafeInteger(offset) ? offset : Number.NaN;
  })
  offset?: number;
}
