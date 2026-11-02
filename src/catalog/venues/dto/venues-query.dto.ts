import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { VENUE_STATUSES, VENUE_TYPES } from '../entities/venue.entity';

export class VenuesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  query?: string;

  @IsOptional()
  @IsUUID()
  localityId?: string;

  @IsOptional()
  @IsUUID()
  administrativeRegionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  province?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsIn(VENUE_TYPES)
  type?: (typeof VENUE_TYPES)[number];

  @IsOptional()
  @IsIn(VENUE_STATUSES)
  status?: (typeof VENUE_STATUSES)[number];
}
