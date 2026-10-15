import { Transform } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDate,
  IsUrl,
  MinLength,
  MaxLength,
  IsUUID,
} from 'class-validator';

function hasImpossibleCalendarDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?=$|[Tt ])/);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1];
}

export class CreateDiscDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;

  @IsUrl()
  @IsOptional()
  @MaxLength(255)
  link?: string;

  @IsUUID('4')
  @IsOptional()
  artistId?: string;

  @IsUUID('4')
  @IsOptional()
  genreId?: string;

  @Transform(({ obj, value }) =>
    typeof obj?.releaseDate === 'string' &&
    hasImpossibleCalendarDate(obj.releaseDate)
      ? new Date(Number.NaN)
      : value,
  )
  @IsDate()
  @IsOptional()
  releaseDate?: Date;

  @Transform(({ obj }) => obj?.ep)
  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @Transform(({ obj }) => obj?.debut)
  @IsBoolean()
  @IsOptional()
  debut?: boolean;

  @Transform(({ obj }) => obj?.featured)
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
