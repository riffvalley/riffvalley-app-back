import { PartialType } from '@nestjs/mapped-types';
import { CreateReunionDto } from './create-reunion.dto';

export class UpdateGenreDto extends PartialType(CreateReunionDto) {}
