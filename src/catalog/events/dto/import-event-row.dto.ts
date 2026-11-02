import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ImportEventLineupItemDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID()
  artistId?: string | null;
}

export class ImportEventRowDto {
  @IsUUID()
  rowId: string;

  @IsIn(['concert', 'festival', 'tour'])
  type: 'concert' | 'festival' | 'tour';

  @IsOptional()
  @IsString()
  @MaxLength(240)
  name?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportEventLineupItemDto)
  lineup?: ImportEventLineupItemDto[];

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  startDate: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  endDate?: string | null;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(150)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  province?: string | null;

  /** Needed only to create a locality that is not already in the catalog. */
  @IsOptional()
  @IsUUID()
  administrativeRegionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  venue?: string | null;

  @IsOptional()
  @IsUUID()
  tourId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  price?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  otherInfo?: string | null;
}
