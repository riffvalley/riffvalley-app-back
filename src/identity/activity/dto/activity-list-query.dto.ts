import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class ActivityListQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn([7, 15, 30])
  @Type(() => Number)
  notVotedDays?: 7 | 15 | 30;

  @IsOptional()
  @IsIn([7, 15, 30])
  @Type(() => Number)
  accessDays?: 7 | 15 | 30;

  @IsOptional()
  @IsIn([7, 15, 30])
  @Type(() => Number)
  inactiveDays?: 7 | 15 | 30;
}
