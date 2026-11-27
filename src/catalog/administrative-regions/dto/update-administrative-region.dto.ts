import { PartialType } from '@nestjs/mapped-types';
import { CreateAdministrativeRegionDto } from './create-administrative-region.dto';

export class UpdateAdministrativeRegionDto extends PartialType(
  CreateAdministrativeRegionDto,
) {}
