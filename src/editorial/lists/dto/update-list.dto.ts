import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { CreateListDto } from './create-list.dto';

export class UpdateListDto extends PartialType(CreateListDto) {
  @IsOptional()
  @IsInt()
  wpPostId?: number;

  @IsOptional()
  @IsString()
  wpPostUrl?: string;
}
