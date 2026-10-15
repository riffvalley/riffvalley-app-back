import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import {
  ChangeType,
  DevState,
  Priority,
} from '../entities/version-item.entity';

export class CreateVersionItemDto {
  @IsEnum(ChangeType)
  type: ChangeType;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  scope?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority = Priority.MEDIUM;

  @IsOptional()
  @IsEnum(DevState)
  state?: DevState;

  @IsString()
  @IsNotEmpty()
  branch: string;

  @IsOptional()
  @IsUUID()
  backUserId?: string;

  @IsOptional()
  @IsUUID()
  frontUserId?: string;
}
