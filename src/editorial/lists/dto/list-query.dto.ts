import { IsArray, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ListStatus } from '../entities/list.entity';

export class ListQueryDto extends PaginationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statusExclusions?: ListStatus[];
}
