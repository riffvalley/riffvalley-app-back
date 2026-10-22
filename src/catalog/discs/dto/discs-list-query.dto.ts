import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class DiscsListQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  genre?: string;

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
  @IsString()
  voted?: string;

  @IsOptional()
  @IsString()
  votedType?: string;

  @IsOptional()
  @IsString()
  orderBy?: string;
}
