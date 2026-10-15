import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GenerateWpPostsQueryDto {
  // Si se indica, solo se crea/actualiza el post de esa posición en vez de
  // todos los de la lista.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  position?: number;
}
