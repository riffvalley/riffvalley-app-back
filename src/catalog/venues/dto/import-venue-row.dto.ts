import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { VENUE_TYPES, VenueType } from '../entities/venue.entity';

export class ImportVenueRowDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(180)
  name: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(VENUE_TYPES)
  type?: VenueType;
}
