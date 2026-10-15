import { PartialType } from '@nestjs/mapped-types';
import { CreateAsignationDto } from './create-asignations.dto';

export class UpdateAsignationDto extends PartialType(CreateAsignationDto) {}
