import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ListStatus, ListType, SpecialListType } from '../entities/list.entity';

export class CreateListDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(ListType)
  type: ListType;

  @IsOptional()
  @IsEnum(ListStatus)
  status?: ListStatus;

  @IsOptional()
  @IsEnum(SpecialListType)
  specialType?: SpecialListType;

  @IsBoolean()
  @IsOptional()
  free?: boolean | null;

  @IsOptional()
  @IsDateString()
  listDate?: string | null; // 👈 string (ISO), no Date

  @IsOptional()
  @IsDateString()
  releaseDate?: string | null; // 👈 string (ISO), no Date

  @IsOptional()
  @IsDateString()
  closeDate?: string | null;


}
