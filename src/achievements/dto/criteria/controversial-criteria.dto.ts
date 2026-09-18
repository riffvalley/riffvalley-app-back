import { IsInt, IsNumber, Min } from 'class-validator';

export class ControversialCriteriaDto {
  @IsNumber()
  @Min(0.1)
  minAbsDeviation: number;

  // Mínimo de votos AJENOS (la media comunitaria excluye siempre el voto propio).
  @IsInt()
  @Min(1)
  minCommunityVotes: number;
}
