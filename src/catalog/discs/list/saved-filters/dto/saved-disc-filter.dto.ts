import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'orderedSavedDiscFilterYears', async: false })
export class OrderedSavedDiscFilterYears
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: { object: object }): boolean {
    const criteria = args.object as SavedDiscFilterCriteriaDto;
    return (
      criteria.yearFrom === undefined ||
      criteria.yearFrom === null ||
      criteria.yearTo === undefined ||
      criteria.yearTo === null ||
      criteria.yearFrom <= criteria.yearTo
    );
  }

  defaultMessage(): string {
    return 'yearFrom must be less than or equal to yearTo';
  }
}

export class SavedDiscFilterCriteriaDto {
  @IsArray()
  @ArrayUnique((genreId: unknown) =>
    typeof genreId === 'string' ? genreId.toLowerCase() : genreId,
  )
  @IsUUID('4', { each: true })
  genreIds: string[] = [];

  @ValidateIf(
    (_object, value: unknown) => value !== null && value !== undefined,
  )
  @IsUUID('4')
  countryId: string | null = null;

  @ValidateIf(
    (_object, value: unknown) => value !== null && value !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(9999)
  @Validate(OrderedSavedDiscFilterYears)
  yearFrom: number | null = null;

  @ValidateIf(
    (_object, value: unknown) => value !== null && value !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(9999)
  @Validate(OrderedSavedDiscFilterYears)
  yearTo: number | null = null;
}

export class CreateSavedDiscFilterDto {
  @IsDefined()
  @IsString()
  @MaxLength(60)
  @Matches(/\S/)
  name: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SavedDiscFilterCriteriaDto)
  filters: SavedDiscFilterCriteriaDto;
}

export class UpdateSavedDiscFilterDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(60)
  @Matches(/\S/)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => SavedDiscFilterCriteriaDto)
  filters?: SavedDiscFilterCriteriaDto;
}

export class SavedDiscFilterIdParamDto {
  @IsUUID('4')
  id: string;
}
