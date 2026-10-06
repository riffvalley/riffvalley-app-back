import { PartialType } from '@nestjs/mapped-types';
import { CreateDiscDto } from './create-discs.dto';

export class UpdateDiscDto extends PartialType(CreateDiscDto) {}
