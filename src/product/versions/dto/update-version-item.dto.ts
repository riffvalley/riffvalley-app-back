// versions/dto/update-version-item.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateVersionItemDto } from './create-version-item.dto';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateVersionItemDto extends PartialType(CreateVersionItemDto) {
  @IsOptional()
  @IsUUID()
  version?: string;
}
