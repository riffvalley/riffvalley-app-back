import {
  IsIn,
  IsOptional,
  IsString,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isManagementInteger', async: false })
class IsManagementIntegerConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;

    const parsedValue = Number(value);
    const minimum = args.constraints[0] as number;

    return Number.isSafeInteger(parsedValue) && parsedValue >= minimum;
  }
}

export class ArtistManagementQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Validate(IsManagementIntegerConstraint, [1])
  limit?: string;

  @IsOptional()
  @Validate(IsManagementIntegerConstraint, [0])
  offset?: string;

  @IsOptional()
  @IsString()
  genreId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  needsReview?: string;
}
