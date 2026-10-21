import { PartialType } from '@nestjs/mapped-types';
import { CreatePointDto } from './create-points.dto';

export class UpdatePointDto extends PartialType(CreatePointDto, {
  skipNullProperties: false,
}) {}
