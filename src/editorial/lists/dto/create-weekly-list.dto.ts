import { IsDateString } from 'class-validator';

export class CreateWeeklyListDto {
  @IsDateString()
  releaseDate: string;
}
