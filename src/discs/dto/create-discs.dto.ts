import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  MinLength,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateDiscDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;

  @IsUrl()
  @IsOptional()
  @MaxLength(255)
  link?: string;

  @IsUUID('4')
  @IsOptional()
  artistId?: string;

  @IsUUID('4')
  @IsOptional()
  genreId?: string;

  @IsOptional()
  releaseDate?: Date;

  @IsOptional()
  ep?: boolean;

  @IsOptional()
  debut?: boolean;

  @IsOptional()
  featured?: boolean;

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
