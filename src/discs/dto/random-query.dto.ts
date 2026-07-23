import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, Max } from 'class-validator';
import { toBoolean } from './options-query.dto';

export class RandomQueryDto {
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
  @IsInt()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  ep?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  debut?: boolean;

  @IsOptional()
  @IsPositive()
  @Max(50)
  @Type(() => Number)
  limit?: number;
}
