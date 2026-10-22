// top-stats-query.dto.ts
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class TopStatsQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4')
  genreId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsDate({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => new Date(item)) : value,
  )
  dateRange?: [Date, Date];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsDate({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => new Date(item)) : value,
  )
  statsDateRange?: [Date, Date];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsDate({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => new Date(item)) : value,
  )
  distributionDateRange?: [Date, Date];
}
