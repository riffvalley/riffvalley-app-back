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
import { EventType } from '../entities/event.entity';
import { EventLineupItemDto } from './event-lineup-item.dto';

export class CreateEventDto {
  @IsIn(Object.values(EventType))
  type: EventType;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  name?: string | null;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  startDate: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  venueId?: string | null;

  @IsOptional()
  @IsUUID()
  localityId?: string | null;

  @IsOptional()
  @IsUUID()
  tourId?: string | null;

  @IsOptional()
  @IsString()
  price?: string | null;

  @IsOptional()
  @IsString()
  otherInfo?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EventLineupItemDto)
  lineup?: EventLineupItemDto[];
}
