import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateArtistDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  image?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;
}
