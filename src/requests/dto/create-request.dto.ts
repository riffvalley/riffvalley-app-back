import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  discName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  artistName: string;

  @IsOptional()
  releaseDate?: Date;

  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @IsBoolean()
  @IsOptional()
  debut?: boolean;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsUrl()
  @IsOptional()
  @MaxLength(255)
  link?: string;

  @IsUUID('4')
  @IsOptional()
  genreId?: string;

  @IsUUID('4')
  @IsOptional()
  countryId?: string;
}
