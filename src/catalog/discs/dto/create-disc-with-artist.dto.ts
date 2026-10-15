import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDiscWithArtistDto {
  // Disc fields
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  discName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  artistName: string;

  @IsUUID()
  @IsOptional()
  genreId?: string;

  @IsDateString({ strict: true })
  @IsOptional()
  releaseDate?: string;

  @Transform(({ obj }) => obj?.ep)
  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @Transform(({ obj }) => obj?.debut)
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

  @IsString()
  @IsOptional()
  description?: string;

  // Artist fields (solo se usan si hay que crear el artista)
  @IsUUID()
  @IsOptional()
  countryId?: string;
}
