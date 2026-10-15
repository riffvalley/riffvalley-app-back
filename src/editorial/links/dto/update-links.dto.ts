import { PartialType } from '@nestjs/mapped-types';
import { CreateLinkDto } from './create-links.dto';

export class UpdateLinkDto extends PartialType(CreateLinkDto) {}
