import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { ValidRoles } from '../interfaces/valid-roles';

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class AdminUpdateUserDto extends PartialType(UpdateUserDto) {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ValidRoles)
  role?: ValidRoles;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  createdAt?: string;
}
