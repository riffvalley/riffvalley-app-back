import { IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ChannelPostsQueryDto {
  @IsOptional()
  @IsPositive()
  @Max(50)
  @Type(() => Number)
  limit?: number = 6;

  @IsOptional()
  @IsString()
  channel?: string = 'conciertosrockmetal';
}
