import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { NewsStatus } from '../entities/news.entity';

export class NewsListQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: NewsStatus;
}
