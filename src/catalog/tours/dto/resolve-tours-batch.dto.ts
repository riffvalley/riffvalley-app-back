import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const MAX_TOUR_RESOLUTION_NAMES = 100;

export class ResolveToursBatchDto {
  @IsArray()
  @ArrayMaxSize(MAX_TOUR_RESOLUTION_NAMES)
  @IsString({ each: true })
  @Matches(/\S/u, { each: true })
  @MaxLength(180, { each: true })
  names: string[];
}
