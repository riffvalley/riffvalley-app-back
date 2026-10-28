import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

function parseCalendarDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(Number.NaN);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

export class TopDiscOptionsQueryDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsDate({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(parseCalendarDate) : value,
  )
  dateRange?: [Date, Date];

  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @IsOptional()
  @IsUUID('4')
  genreId?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
