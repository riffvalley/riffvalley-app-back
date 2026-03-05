import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateNationalReleaseDto } from './create-national-release.dto';

export class UpdateNationalReleaseDto extends PartialType(CreateNationalReleaseDto) {
  @IsBoolean()
  @IsOptional()
  approved?: boolean;
}
