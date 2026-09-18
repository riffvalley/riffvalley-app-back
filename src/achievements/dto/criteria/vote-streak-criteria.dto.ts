import { IsIn, IsInt, Min } from 'class-validator';

export class VoteStreakCriteriaDto {
  @IsInt()
  @Min(1)
  minDays: number;

  // 'current': racha activa en el momento de evaluar (puede romperse después).
  // 'ever': racha máxima histórica alcanzada alguna vez (no se pierde).
  @IsIn(['current', 'ever'])
  mode: 'current' | 'ever';
}
