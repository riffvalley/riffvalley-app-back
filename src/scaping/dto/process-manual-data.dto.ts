import { IsArray, IsNotEmpty, IsString, IsUUID } from 'class-validator';

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
}
