import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class EventLineupItemDto {
  @IsOptional()
  @IsUUID()
  artistId?: string | null;

  @IsOptional()
  @IsUUID()
  tourId?: string | null;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  name: string;
}
