import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResolveLocalityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/u)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Matches(/\S/u)
  province?: string | null;

  @IsOptional()
  @IsUUID()
  administrativeRegionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/u)
  administrativeRegion?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;
}
