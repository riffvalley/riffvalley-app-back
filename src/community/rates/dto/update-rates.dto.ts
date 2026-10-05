import { PartialType } from '@nestjs/mapped-types';
import { CreateRateDto } from './create-rates.dto';

export class UpdateRateDto extends PartialType(CreateRateDto) {}
