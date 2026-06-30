import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EventType } from '../entities/evento.entity';

export class CreateEventoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ticketLink?: string;

  @IsOptional()
  @IsUUID()
  localizacionId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  artistIds?: string[];
}
