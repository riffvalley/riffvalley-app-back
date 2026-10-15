import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateGenreDto } from './create-genre.dto';

export class CreateGenresBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGenreDto)
  genres: { name: string; color: string }[];
}
