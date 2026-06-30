import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { LocationType } from '../entities/localizacion.entity';

export class CreateLocalizacionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
