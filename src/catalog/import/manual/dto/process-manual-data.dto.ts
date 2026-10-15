import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AlbumItemDto {
  @Allow()
  line?: string;

  @Allow()
  genreId?: string;

  @Allow()
  countryId?: string;

  @Allow()
  ep?: boolean;

  @Allow()
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
