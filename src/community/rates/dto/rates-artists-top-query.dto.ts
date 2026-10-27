import { IsIn, IsOptional } from 'class-validator';

export type RatesArtistsTopPeriod = 'month' | 'year' | 'all';

export class RatesArtistsTopQueryDto {
  @IsOptional()
  @IsIn(['month', 'year', 'all'])
  period: RatesArtistsTopPeriod = 'all';
}
