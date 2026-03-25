import { IsBoolean, IsDateString, IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LinkDiscDto {
  // Opción A: vincular un disco existente
  @IsUUID()
  @IsOptional()
  discId?: string;

  // Opción B: crear un disco nuevo y vincularlo
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsUUID()
  @IsOptional()
  artistId?: string;

  @IsUUID()
  @IsOptional()
  genreId?: string;

  @IsDateString()
  @IsOptional()
  releaseDate?: string;

  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @IsBoolean()
  @IsOptional()
  debut?: boolean;

  @IsUrl()
  @IsOptional()
  @MaxLength(255)
  link?: string;

  @IsString()
  @IsOptional()
  image?: string;
}
