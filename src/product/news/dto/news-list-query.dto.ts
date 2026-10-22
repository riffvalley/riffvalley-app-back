import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class NewsListQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;
}
