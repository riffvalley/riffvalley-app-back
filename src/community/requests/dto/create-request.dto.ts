import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
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
  @Matches(
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
  )
  @IsDateString({ strict: true, strictSeparator: true })
  releaseDate?: string | null;

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
  genreId?: string | null;

  @IsUUID('4')
  @IsOptional()
  countryId?: string | null;
}
