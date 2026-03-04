import { PartialType } from '@nestjs/mapped-types';
import { CreateNationalReleaseDto } from './create-national-release.dto';

export class UpdateNationalReleaseDto extends PartialType(CreateNationalReleaseDto) {}
