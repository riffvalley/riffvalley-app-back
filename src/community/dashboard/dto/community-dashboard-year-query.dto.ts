import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CommunityDashboardYearQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2025)
  @Max(9999)
  year: number;
}
