import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LocalityInspectionInputDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(150)
  name: string;

  @IsUUID()
  countryId: string;

  @IsOptional()
  @IsUUID()
  administrativeRegionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  province?: string;
}

export class InspectLocalitiesBatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LocalityInspectionInputDto)
  localities: LocalityInspectionInputDto[];
}
