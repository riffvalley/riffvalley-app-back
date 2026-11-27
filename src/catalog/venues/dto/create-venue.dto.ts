import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  Validate,
} from 'class-validator';
import { VENUE_STATUSES, VENUE_TYPES } from '../entities/venue.entity';
import { CoordinatePairConstraint } from './venue-coordinates.dto';

export class CreateVenueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @Matches(/\S/u)
  name: string;

  @IsIn(VENUE_TYPES)
  type: (typeof VENUE_TYPES)[number];

  @IsOptional()
  @IsIn(VENUE_STATUSES)
  status?: (typeof VENUE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsInt()
  @Min(1)
  @Max(2147483647)
  capacity?: number | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  website?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  image?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  accessibility?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsUUID()
  localityId: string;

  @IsOptional()
  @Validate(CoordinatePairConstraint)
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
