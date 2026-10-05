import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreateRequestDto } from './create-request.dto';

export class UpdateRequestDto extends PartialType(CreateRequestDto) {
  @IsString()
  @IsOptional()
  adminNotes?: string;
}
