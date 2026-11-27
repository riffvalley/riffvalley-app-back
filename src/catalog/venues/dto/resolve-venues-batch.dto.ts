import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VenueResolutionInputDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(180)
  name: string;

  @IsUUID()
  localityId: string;
}

export class ResolveVenuesBatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VenueResolutionInputDto)
  venues: VenueResolutionInputDto[];
}
