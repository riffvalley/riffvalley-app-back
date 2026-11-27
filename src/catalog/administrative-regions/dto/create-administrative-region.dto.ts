import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdministrativeRegionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/u)
  name: string;

  @IsUUID()
  countryId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/\S/u)
  code?: string | null;
}
