import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DiscType } from '../entities/national-release.entity';

export class CreateNationalReleaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  artistName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  discName: string;

  @IsEnum(DiscType)
  discType: DiscType;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  genre: string;

  @IsDateString()
  releaseDay: string;

  @IsDateString()
  @IsOptional()
  publishAt?: string;
}
