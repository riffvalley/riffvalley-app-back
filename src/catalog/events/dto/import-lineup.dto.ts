import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ImportEventRowDto } from './import-event-row.dto';

export class ImportLineupArtistDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID()
  artistId?: string | null;
}

export class ImportLineupSourceDto extends ImportEventRowDto {
  @IsUUID()
  countryId: string;
}

export class ImportEventLineupDto {
  @IsUUID()
  batchId: string;

  @IsUUID()
  rowId: string;

  @ValidateNested()
  @Type(() => ImportLineupSourceDto)
  sourceRow: ImportLineupSourceDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportLineupArtistDto)
  artists: ImportLineupArtistDto[];
}
