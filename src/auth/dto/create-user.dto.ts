import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DashboardModuleConfigDto {
  @IsString()
  id: string;

  @IsBoolean()
  enabled: boolean;
}

export class CreateUserDto {
  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  @Matches(/(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'The password must have a Uppercase, lowercase letter and a number',
  })
  password: string;

  @IsString()
  @MinLength(4)
  username: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString()
  image: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardModuleConfigDto)
  dashboardConfig?: DashboardModuleConfigDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  createdAt?: Date;
}
