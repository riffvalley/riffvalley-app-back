import { PartialType } from '@nestjs/mapped-types';
import { CreatePointDto } from './create-points.dto';

export class UpdateDiscDto extends PartialType(CreatePointDto) {}
