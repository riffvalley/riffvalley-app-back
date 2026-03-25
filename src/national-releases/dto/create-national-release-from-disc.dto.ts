import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { DiscType } from '../entities/national-release.entity';

export class CreateNationalReleaseFromDiscDto {
  @IsUUID()
  discId: string;

  @IsDateString()
  releaseDay: string;

  @IsBoolean()
  @IsOptional()
  approved?: boolean;

  @IsDateString()
  @IsOptional()
  publishAt?: string;

  // Campos opcionales para sobreescribir los del disco
  @IsEnum(DiscType)
  @IsOptional()
  discType?: DiscType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  genre?: string;

  @IsUrl()
  @IsOptional()
  @MaxLength(500)
  link?: string;
}
