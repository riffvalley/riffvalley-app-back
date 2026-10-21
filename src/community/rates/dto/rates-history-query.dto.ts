import { IsDateString, IsIn, IsOptional, Matches } from 'class-validator';

export class RatesHistoryQueryDto {
  @IsOptional()
  @IsIn(['rate', 'cover', 'both'])
  type: 'rate' | 'cover' | 'both' = 'both';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @Matches(/^0*[1-9]\d*$/, {
    message: 'limit must be a positive integer',
  })
  limit: string = '20';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'offset must be a non-negative integer',
  })
  offset: string = '0';

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
