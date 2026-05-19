import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ProcessManualDataDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  albums: string[];

  @IsUUID()
  @IsNotEmpty()
  genreId: string;

  @IsUUID()
  @IsNotEmpty()
  countryId: string;

  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @IsBoolean()
  @IsOptional()
  debut?: boolean;
}
