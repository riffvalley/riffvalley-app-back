import { PartialType } from '@nestjs/mapped-types';
import { CreateLocalizacionDto } from './create-localizacion.dto';

export class UpdateLocalizacionDto extends PartialType(CreateLocalizacionDto) {}
