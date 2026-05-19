import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class AlbumItemDto {
  @IsString()
  @IsNotEmpty()
  line: string;

  @IsUUID()
  @IsOptional()
  genreId?: string;

  @IsUUID()
  @IsOptional()
  countryId?: string;

  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @IsBoolean()
  @IsOptional()
  debut?: boolean;
}

export class ProcessManualDataDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlbumItemDto)
  albums: AlbumItemDto[];
}
