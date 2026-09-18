import { IsInt, Min } from 'class-validator';

// Usado por DISTINCT_ARTISTS_IN_GENRE, DISTINCT_GENRES, DISTINCT_COUNTRIES,
// TOTAL_VOTES, TOTAL_COMMENTS y TOTAL_FAVORITES: todos son "alcanza un conteo mínimo".
export class MinCountCriteriaDto {
  @IsInt()
  @Min(1)
  minCount: number;
}
