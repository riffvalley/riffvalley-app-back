import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_PATTERN,
} from '../passwords/password-policy';

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
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_POLICY_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @IsString()
  @MinLength(4)
  username: string;

  @IsOptional()
  @IsString()
  image: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardModuleConfigDto)
  dashboardConfig?: DashboardModuleConfigDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardModuleConfigDto)
  mobileDashboardConfig?: DashboardModuleConfigDto[];

  @IsOptional()
  @IsBoolean()
  dashboardButtonsEnabled?: boolean;
}
