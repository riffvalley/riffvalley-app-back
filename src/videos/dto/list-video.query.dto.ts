import {
  IsInt,
  IsOptional,
  IsString,
  IsISO8601,
  Max,
  Min,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const ESTADOS = [
  'not_started',
  'in_progress',
  'editing',
  'ready',
  'published',
] as const;
const TIPOS = ['best', 'custom'] as const;
type VideoStatusType = (typeof ESTADOS)[number];
type VideoTypeType = (typeof TIPOS)[number];

export class ListVideoQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(ESTADOS as readonly string[])
  status?: VideoStatusType;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(TIPOS as readonly string[])
  type?: VideoTypeType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
